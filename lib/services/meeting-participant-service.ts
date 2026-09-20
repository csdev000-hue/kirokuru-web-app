import { AUDIT_ACTIONS } from "@/lib/security/audit-actions";
import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { meetingParticipants } from "@/lib/db/schema";
import { requireMeetingAccess } from "@/lib/permissions/resource";
import { AccessError } from "@/lib/permissions/errors";
import { BusinessError } from "@/lib/api/errors";
import { resourceId } from "@/lib/api/request";
import { writeAuditLog } from "@/lib/security/audit";
import { createParticipantSchema, updateParticipantSchema } from "@/lib/validators/meeting-participant";
import { contextMembers, lockMeeting, meetingValidation, rethrowMeetingConstraint, type MeetingReadDb } from "./meeting-common";
export async function listParticipants(userId: string, meetingId: string, db: MeetingReadDb = getDb()) {
 await requireMeetingAccess({ userId, meetingId }, db);
 return db.select().from(meetingParticipants).where(eq(meetingParticipants.meetingId, meetingId)).orderBy(meetingParticipants.id);
}
export async function addParticipant(userId: string, meetingId: string, input: unknown, db = getDb()) {
 const data = meetingValidation(createParticipantSchema, input);
 return db.transaction(async (tx) => {
  const { access } = await lockMeeting(userId, meetingId, tx);
  const members = await contextMembers(access.projectId, access.organizationId, tx); const member = members.find((m) => m.userId === data.userId);
  if (data.userId && !member) throw new BusinessError("INVALID_PARTICIPANT", 422, "参加者はこのプロジェクトのメンバーから選択してください。");
  const [row] = await tx.insert(meetingParticipants).values({ meetingId, userId: data.userId ?? null, displayName: data.displayName ?? member!.name, role: data.role }).returning();
  await writeAuditLog({ organizationId: access.organizationId, userId, action: AUDIT_ACTIONS.MEETING_PARTICIPANT_ADD, resourceType: "participant", resourceId: row.id, metadata: { projectId: access.projectId, meetingId } }, tx); return row;
 }).catch(rethrowMeetingConstraint);
}
async function protectHost(meetingId: string, role: string, db: MeetingReadDb) {
 if (role !== "host") return;
 const hosts = await db.select({ id: meetingParticipants.id }).from(meetingParticipants).where(and(eq(meetingParticipants.meetingId, meetingId), eq(meetingParticipants.role, "host"))).limit(2);
 if (hosts.length < 2) throw new BusinessError("LAST_HOST_REQUIRED", 409, "最後のhostは削除・降格できません。");
}
export async function updateParticipant(userId: string, meetingId: string, participantId: string, input: unknown, db = getDb()) {
 resourceId(participantId); const data = meetingValidation(updateParticipantSchema, input);
 return db.transaction(async (tx) => {
  const { access } = await lockMeeting(userId, meetingId, tx);
  const where = and(eq(meetingParticipants.id, participantId), eq(meetingParticipants.meetingId, meetingId));
  const [current] = await tx.select().from(meetingParticipants).where(where); if (!current) throw new AccessError("RESOURCE_NOT_FOUND");
  if (data.role === "participant") await protectHost(meetingId, current.role, tx);
  const [row] = await tx.update(meetingParticipants).set(data).where(where).returning();
  await writeAuditLog({ organizationId: access.organizationId, userId, action: AUDIT_ACTIONS.MEETING_PARTICIPANT_UPDATE, resourceType: "participant", resourceId: row.id, metadata: { projectId: access.projectId, meetingId, changedFields: (["displayName", "role"] as const).filter((key) => data[key] !== undefined) } }, tx); return row;
 });
}
export async function removeParticipant(userId: string, meetingId: string, participantId: string, db = getDb()) {
 resourceId(participantId);
 return db.transaction(async (tx) => {
  const { access } = await lockMeeting(userId, meetingId, tx);
  const where = and(eq(meetingParticipants.id, participantId), eq(meetingParticipants.meetingId, meetingId));
  const [current] = await tx.select().from(meetingParticipants).where(where); if (!current) throw new AccessError("RESOURCE_NOT_FOUND");
  await protectHost(meetingId, current.role, tx);
  await tx.delete(meetingParticipants).where(where);
  await writeAuditLog({ organizationId: access.organizationId, userId, action: AUDIT_ACTIONS.MEETING_PARTICIPANT_REMOVE, resourceType: "participant", resourceId: participantId, metadata: { projectId: access.projectId, meetingId } }, tx);
 });
}
export async function recordMyAttendance(userId: string, meetingId: string, action: "join" | "leave", db = getDb()) {
 return db.transaction(async (tx) => {
  const { access } = await lockMeeting(userId, meetingId, tx);
  const where = and(eq(meetingParticipants.meetingId, meetingId), eq(meetingParticipants.userId, userId));
  const [current] = await tx.select().from(meetingParticipants).where(where); if (!current) throw new AccessError("RESOURCE_NOT_FOUND");
  if (action === "leave" && !current.joinedAt) throw new BusinessError("INVALID_TRANSITION", 409, "参加を記録してから退出してください。");
  const [row] = await tx.update(meetingParticipants).set(action === "join" ? { joinedAt: new Date(), leftAt: null } : { leftAt: new Date() }).where(where).returning();
  await writeAuditLog({ organizationId: access.organizationId, userId, action: AUDIT_ACTIONS.MEETING_PARTICIPANT_UPDATE, resourceType: "participant", resourceId: current.id, metadata: { projectId: access.projectId, meetingId, changedFields: action === "join" ? ["joinedAt", "leftAt"] : ["leftAt"] } }, tx); return row;
 });
}
