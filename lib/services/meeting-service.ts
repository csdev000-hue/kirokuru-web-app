import { AUDIT_ACTIONS } from "@/lib/security/audit-actions";
import "server-only";
import { and, asc, count, max, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { meetings, meetingParticipants, meetingTranscripts, meetingRecordings, meetingMinutes, ticketCandidates, tickets, users } from "@/lib/db/schema";
import { requireProjectMember, requireProjectViewer } from "@/lib/permissions/project";
import { requireMeetingAccess } from "@/lib/permissions/resource";
import { AccessError } from "@/lib/permissions/errors";
import { BusinessError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/security/audit";
import { createMeetingSchema, updateMeetingSchema, meetingListQuerySchema, transitions, type MeetingStatus } from "@/lib/validators/meeting";
import { assertMeetingEditable, lockMeeting, meetingValidation, type MeetingReadDb } from "./meeting-common";
import { lockActiveProject } from "./ticket-service";
const selection = { liveStartedAt: meetings.liveStartedAt, liveEndedAt: meetings.liveEndedAt, id: meetings.id, projectId: meetings.projectId, title: meetings.title, meetingDate: meetings.meetingDate, status: meetings.status, createdBy: { id: users.id, name: users.name }, createdAt: meetings.createdAt, updatedAt: meetings.updatedAt };
export async function listMeetings(userId: string, projectId: string, input: unknown = {}, db = getDb()) {
 await requireProjectViewer({ userId, projectId }, db);
 const f = meetingValidation(meetingListQuerySchema, input);
 // Calendar filters are JST, matching the UI. The upper date includes the whole day.
 const end = f.to ? new Date(new Date(`${f.to}T00:00:00+09:00`).getTime() + 86400000) : undefined;
 const where = and(eq(meetings.projectId, projectId), f.status ? eq(meetings.status, f.status) : undefined, f.from ? gte(meetings.meetingDate, new Date(`${f.from}T00:00:00+09:00`)) : undefined, end ? lt(meetings.meetingDate, end) : undefined);
 const order = f.order === "asc" ? asc(meetings[f.sort]) : desc(meetings[f.sort]);
 return db.transaction(async (tx) => {
  const counts = tx.select({ meetingId: meetingParticipants.meetingId, value: count().as("participant_count") }).from(meetingParticipants).groupBy(meetingParticipants.meetingId).as("participant_counts");
  const data = await tx.select({ ...selection, participantCount: sql<number>`coalesce(${counts.value}, 0)`.mapWith(Number) }).from(meetings).innerJoin(users, eq(users.id, meetings.createdBy)).leftJoin(counts, eq(counts.meetingId, meetings.id)).where(where).orderBy(order, asc(meetings.id)).limit(f.limit).offset((f.page - 1) * f.limit);
  const [total] = await tx.select({ value: count() }).from(meetings).where(where);
  return { data, meta: { page: f.page, limit: f.limit, total: total.value, totalPages: Math.ceil(total.value / f.limit) } };
 }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
export async function getMeeting(userId: string, meetingId: string, db: MeetingReadDb = getDb()) {
 await requireMeetingAccess({ userId, meetingId }, db);
 const [meeting] = await db.select(selection).from(meetings).innerJoin(users, eq(users.id, meetings.createdBy)).where(eq(meetings.id, meetingId));
 if (!meeting) throw new AccessError("RESOURCE_NOT_FOUND");
 const participants = await db.select({ id: meetingParticipants.id, userId: meetingParticipants.userId, displayName: meetingParticipants.displayName, role: meetingParticipants.role, joinedAt: meetingParticipants.joinedAt, leftAt: meetingParticipants.leftAt }).from(meetingParticipants).where(eq(meetingParticipants.meetingId, meetingId)).orderBy(meetingParticipants.id);
 const [transcriptCount] = await db.select({ value: count(), lastSequenceNo: max(meetingTranscripts.sequenceNo) }).from(meetingTranscripts).where(eq(meetingTranscripts.meetingId, meetingId));
 const [recording] = await db.select({ id: meetingRecordings.id, status: meetingRecordings.status }).from(meetingRecordings).where(and(eq(meetingRecordings.meetingId, meetingId), isNull(meetingRecordings.deletedAt))).orderBy(desc(meetingRecordings.createdAt)).limit(1);
 const [minutes] = await db.select({ id: meetingMinutes.id, version: meetingMinutes.version, status: meetingMinutes.status }).from(meetingMinutes).where(eq(meetingMinutes.meetingId, meetingId)).orderBy(desc(meetingMinutes.version)).limit(1);
 return { ...meeting, participants, transcriptCount: transcriptCount.value, lastSequenceNo: transcriptCount.lastSequenceNo ?? 0, recording: recording ?? null, minutes: minutes ?? null };
}
export async function createMeeting(userId: string, projectId: string, input: unknown, db = getDb()) {
 const data = meetingValidation(createMeetingSchema, input);
 return db.transaction(async (tx) => {
  const access = await requireProjectMember({ userId, projectId }, tx); await lockActiveProject(projectId, tx);
  const [user] = await tx.select({ name: users.name }).from(users).where(eq(users.id, userId)); if (!user) throw new AccessError("UNAUTHENTICATED");
  const [row] = await tx.insert(meetings).values({ title: data.title, meetingDate: new Date(data.meetingDate), projectId, createdBy: userId, status: "scheduled" }).returning({ id: meetings.id });
  await tx.insert(meetingParticipants).values({ meetingId: row.id, userId, displayName: user.name, role: "host" });
  await writeAuditLog({ organizationId: access.organizationId, userId, action: AUDIT_ACTIONS.MEETING_CREATE, resourceType: "meeting", resourceId: row.id, metadata: { projectId, meetingId: row.id } }, tx);
  return getMeeting(userId, row.id, tx);
 });
}
export function validateMeetingTransition(from: MeetingStatus, to: MeetingStatus) {
 if (from !== to && !transitions[from].includes(to)) throw new BusinessError("INVALID_TRANSITION", 409, "この会議状態への変更は許可されていません。");
}
export async function updateMeeting(userId: string, meetingId: string, input: unknown, db = getDb()) {
 const data = meetingValidation(updateMeetingSchema, input);
 return db.transaction(async (tx) => {
  const { access, meeting } = await lockMeeting(userId, meetingId, tx, false);
  if (data.title !== undefined || data.meetingDate !== undefined) assertMeetingEditable(meeting.status);
  if (data.status && data.status !== meeting.status && meeting.liveStartedAt) throw new BusinessError("MEETING_INVALID_STATUS", 409, "オンライン会議の終了操作を利用してください。");
  if (data.status) validateMeetingTransition(meeting.status, data.status);
  await tx.update(meetings).set({ ...(data.title !== undefined ? { title: data.title } : {}), ...(data.meetingDate ? { meetingDate: new Date(data.meetingDate) } : {}), ...(data.status ? { status: data.status } : {}) }).where(eq(meetings.id, meetingId));
  const base = { organizationId: access.organizationId, userId, resourceType: "meeting" as const, resourceId: meetingId };
  if (data.title !== undefined || data.meetingDate !== undefined) await writeAuditLog({ ...base, action: AUDIT_ACTIONS.MEETING_UPDATE, metadata: { projectId: access.projectId, meetingId, changedFields: (["title", "meetingDate"] as const).filter((key) => data[key] !== undefined) } }, tx);
  if (data.status && data.status !== meeting.status) await writeAuditLog({ ...base, action: AUDIT_ACTIONS.MEETING_STATUS_CHANGE, metadata: { projectId: access.projectId, meetingId, from: meeting.status, to: data.status } }, tx);
  return getMeeting(userId, meetingId, tx);
 });
}
export const transitionMeetingStatus = (userId: string, meetingId: string, status: MeetingStatus, db = getDb()) => updateMeeting(userId, meetingId, { status }, db);
export async function deleteMeeting(userId: string, meetingId: string, db = getDb()) {
 return db.transaction(async (tx) => {
  const { access, meeting } = await lockMeeting(userId, meetingId, tx);
  if (meeting.liveStartedAt) throw new BusinessError("MEETING_NOT_EMPTY", 409, "オンライン会議の履歴は削除できません。");
  // Related data never cascades. A deleted Ticket still retains its source reference.
  const related = await tx.select({ value: sql<boolean>`exists(select 1 from ${meetingTranscripts} where ${meetingTranscripts.meetingId} = ${meetingId}) or exists(select 1 from ${meetingRecordings} where ${meetingRecordings.meetingId} = ${meetingId}) or exists(select 1 from ${meetingMinutes} where ${meetingMinutes.meetingId} = ${meetingId}) or exists(select 1 from ${ticketCandidates} where ${ticketCandidates.meetingId} = ${meetingId}) or exists(select 1 from ${tickets} where ${tickets.sourceMeetingId} = ${meetingId})` }).from(meetings).where(eq(meetings.id, meetingId));
  if (related[0].value) throw new BusinessError("MEETING_NOT_EMPTY", 409, "関連データが存在する会議は削除できません。");
  await writeAuditLog({ organizationId: access.organizationId, userId, action: AUDIT_ACTIONS.MEETING_DELETE, resourceType: "meeting", resourceId: meetingId, metadata: { projectId: access.projectId, meetingId } }, tx);
  await tx.delete(meetingParticipants).where(eq(meetingParticipants.meetingId, meetingId));
  await tx.delete(meetings).where(eq(meetings.id, meetingId));
 });
}
