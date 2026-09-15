import "server-only";
import { and, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { meetingTranscripts, meetingMinutes, ticketCandidates } from "@/lib/db/schema";
import { requireMeetingAccess } from "@/lib/permissions/resource";
import { AccessError } from "@/lib/permissions/errors";
import { BusinessError } from "@/lib/api/errors";
import { resourceId } from "@/lib/api/request";
import { writeAuditLog } from "@/lib/security/audit";
import { createTranscriptSchema, updateTranscriptSchema, bulkTranscriptSchema, transcriptQuerySchema } from "@/lib/validators/meeting-transcript";
import { contextMembers, lockMeeting, meetingValidation, rethrowMeetingConstraint, type MeetingReadDb } from "./meeting-common";
export const transcriptOutput = (row: typeof meetingTranscripts.$inferSelect) => ({ ...row, startedAt: Number(row.startedAt), endedAt: row.endedAt === null ? null : Number(row.endedAt) });
export async function listTranscripts(userId: string, meetingId: string, input: unknown = {}, db: MeetingReadDb = getDb()) {
 await requireMeetingAccess({ userId, meetingId }, db); const f = meetingValidation(transcriptQuerySchema, input);
 const rows = await db.select().from(meetingTranscripts).where(and(eq(meetingTranscripts.meetingId, meetingId), gte(meetingTranscripts.sequenceNo, f.fromSequence))).orderBy(meetingTranscripts.sequenceNo).limit(f.limit + 1);
 const hasMore = rows.length > f.limit; const data = rows.slice(0, f.limit).map(transcriptOutput);
 return { data, meta: { nextSequence: hasMore ? rows[f.limit].sequenceNo : null } };
}
async function assertNoEvidence(meetingId: string, db: MeetingReadDb) {
 const [minutes] = await db.select({ id: meetingMinutes.id }).from(meetingMinutes).where(eq(meetingMinutes.meetingId, meetingId)).limit(1);
 const [candidate] = await db.select({ id: ticketCandidates.id }).from(ticketCandidates).where(eq(ticketCandidates.meetingId, meetingId)).limit(1);
 if (minutes || candidate) throw new BusinessError("TRANSCRIPT_REFERENCED", 409, "議事録・候補が存在する会議の文字起こしは変更できません。");
}
export async function bulkCreateTranscripts(userId: string, meetingId: string, input: unknown, db = getDb(), single = false) {
 const { transcripts } = meetingValidation(bulkTranscriptSchema, input);
 return db.transaction(async (tx) => {
  const { access } = await lockMeeting(userId, meetingId, tx); await assertNoEvidence(meetingId, tx);
  const members = new Set((await contextMembers(access.projectId, access.organizationId, tx)).map((m) => m.userId));
  for (const row of transcripts) if (row.speakerUserId && !members.has(row.speakerUserId)) throw new BusinessError("INVALID_SPEAKER", 422, "話者はこのプロジェクトのメンバーから選択してください。");
  const rows = await tx.insert(meetingTranscripts).values(transcripts.map((row) => ({ ...row, meetingId, speakerUserId: row.speakerUserId ?? null, startedAt: row.startedAt.toFixed(3), endedAt: row.endedAt == null ? null : row.endedAt.toFixed(3) }))).returning();
  await writeAuditLog({ organizationId: access.organizationId, userId, action: single ? "meeting.transcript.create" : "meeting.transcript.bulk_create", resourceType: single ? "transcript" : "meeting", resourceId: single ? rows[0].id : meetingId, metadata: { projectId: access.projectId, meetingId, count: rows.length } }, tx);
  return rows.sort((a, b) => a.sequenceNo - b.sequenceNo).map(transcriptOutput);
 }).catch(rethrowMeetingConstraint);
}
export async function createTranscript(userId: string, meetingId: string, input: unknown, db = getDb()) {
 const row = meetingValidation(createTranscriptSchema, input); return (await bulkCreateTranscripts(userId, meetingId, { transcripts: [row] }, db, true))[0];
}
export async function updateTranscript(userId: string, meetingId: string, transcriptId: string, input: unknown, db = getDb()) {
 resourceId(transcriptId); const patch = meetingValidation(updateTranscriptSchema, input);
 return db.transaction(async (tx) => {
  const { access } = await lockMeeting(userId, meetingId, tx); await assertNoEvidence(meetingId, tx);
  const where = and(eq(meetingTranscripts.meetingId, meetingId), eq(meetingTranscripts.id, transcriptId));
  const [current] = await tx.select().from(meetingTranscripts).where(where); if (!current) throw new AccessError("RESOURCE_NOT_FOUND");
  const data = meetingValidation(createTranscriptSchema, { speakerUserId: current.speakerUserId, speakerName: current.speakerName, startedAt: Number(current.startedAt), endedAt: current.endedAt === null ? null : Number(current.endedAt), text: current.text, sequenceNo: current.sequenceNo, ...patch });
  if (data.speakerUserId && !(await contextMembers(access.projectId, access.organizationId, tx)).some((m) => m.userId === data.speakerUserId)) throw new BusinessError("INVALID_SPEAKER", 422, "話者はこのプロジェクトのメンバーから選択してください。");
  const [row] = await tx.update(meetingTranscripts).set({ ...data, startedAt: data.startedAt.toFixed(3), endedAt: data.endedAt == null ? null : data.endedAt.toFixed(3) }).where(where).returning();
  await writeAuditLog({ organizationId: access.organizationId, userId, action: "meeting.transcript.update", resourceType: "transcript", resourceId: transcriptId, metadata: { projectId: access.projectId, meetingId, changedFields: (["speakerUserId", "speakerName", "startedAt", "endedAt", "text", "sequenceNo"] as const).filter((key) => patch[key] !== undefined) } }, tx); return transcriptOutput(row);
 }).catch(rethrowMeetingConstraint);
}
export async function deleteTranscript(userId: string, meetingId: string, transcriptId: string, db = getDb()) {
 resourceId(transcriptId);
 return db.transaction(async (tx) => {
  const { access } = await lockMeeting(userId, meetingId, tx); await assertNoEvidence(meetingId, tx);
  const [row] = await tx.delete(meetingTranscripts).where(and(eq(meetingTranscripts.meetingId, meetingId), eq(meetingTranscripts.id, transcriptId))).returning({ id: meetingTranscripts.id }); if (!row) throw new AccessError("RESOURCE_NOT_FOUND");
  await writeAuditLog({ organizationId: access.organizationId, userId, action: "meeting.transcript.delete", resourceType: "transcript", resourceId: transcriptId, metadata: { projectId: access.projectId, meetingId } }, tx);
 });
}
