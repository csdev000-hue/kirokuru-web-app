import { AUDIT_ACTIONS } from "@/lib/security/audit-actions";
import "server-only";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { meetingMinutes, meetings, meetingTranscripts } from "@/lib/db/schema";
import { requireMeetingAccess, requireMinutesAccess } from "@/lib/permissions/resource";
import { AccessError } from "@/lib/permissions/errors";
import { BusinessError, validationError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/security/audit";
import { editMinutesSchema } from "@/lib/validators/meeting-minutes";
import { MINUTES_SCHEMA_VERSION, minutesAIResultSchema, type MinutesAIResult } from "@/lib/ai/schemas/minutes";
import { validateMinutes } from "@/lib/ai/validators/minutes-business-validator";
import { loadMeetingAIContext } from "./meeting-ai-context";
import { lockActiveProject } from "./ticket-service";
import type { MeetingReadDb } from "./meeting-common";
export const minutesSelection = { id: meetingMinutes.id, meetingId: meetingMinutes.meetingId, version: meetingMinutes.version, status: meetingMinutes.status, summary: meetingMinutes.summary, decisions: meetingMinutes.decisions, actionItems: meetingMinutes.actionItems, issues: meetingMinutes.issues, pendingItems: meetingMinutes.pendingItems, aiModel: meetingMinutes.aiModel, promptVersion: meetingMinutes.promptVersion, schemaVersion: meetingMinutes.schemaVersion, createdBy: meetingMinutes.createdBy, createdAt: meetingMinutes.createdAt, updatedAt: meetingMinutes.updatedAt };
export function minutesDocument(row: { meetingId: string; summary: unknown; decisions: unknown; actionItems: unknown; issues: unknown; pendingItems: unknown }) {
 return minutesAIResultSchema.parse({ schema_version: MINUTES_SCHEMA_VERSION, language: "ja", meeting_id: row.meetingId, summary: row.summary, decisions: row.decisions, action_items: row.actionItems, issues: row.issues, pending_items: row.pendingItems });
}
export const contentColumns = (data: MinutesAIResult) => ({ summary: data.summary, decisions: data.decisions, actionItems: data.action_items, issues: data.issues, pendingItems: data.pending_items });
export async function listMinutes(userId: string, meetingId: string, version?: number, db: MeetingReadDb = getDb()) {
 await requireMeetingAccess({ userId, meetingId }, db);
 return db.select({ id: meetingMinutes.id, version: meetingMinutes.version, status: meetingMinutes.status, createdAt: meetingMinutes.createdAt, createdBy: meetingMinutes.createdBy, aiModel: meetingMinutes.aiModel, promptVersion: meetingMinutes.promptVersion }).from(meetingMinutes).where(and(eq(meetingMinutes.meetingId, meetingId), version === undefined ? undefined : eq(meetingMinutes.version, version))).orderBy(desc(meetingMinutes.version));
}
export async function getMinutes(userId: string, minutesId: string, db: MeetingReadDb = getDb()) {
 await requireMinutesAccess({ userId, minutesId }, db);
 const [row] = await db.select(minutesSelection).from(meetingMinutes).where(eq(meetingMinutes.id, minutesId));
 if (!row) throw new AccessError("RESOURCE_NOT_FOUND");
 // Never pass unvalidated JSONB (or raw model output) to a client, including older rows.
 const content = minutesDocument(row);
 return { ...row, ...contentColumns(content) };
}
async function mutateMinutes(userId: string, minutesId: string, input: unknown, approve: boolean, db = getDb()) {
 const parsed = editMinutesSchema.safeParse(input);
 if (!approve && !parsed.success) throw validationError();
 const data = !approve && parsed.success ? parsed.data : {};
 return db.transaction(async (tx) => {
  const access = await requireMinutesAccess({ userId, minutesId, minimumRole: "member" }, tx); await lockActiveProject(access.projectId, tx);
  const [meeting] = await tx.select().from(meetings).where(eq(meetings.id, (await tx.select({ meetingId: meetingMinutes.meetingId }).from(meetingMinutes).where(eq(meetingMinutes.id, minutesId)))[0].meetingId)).for("update");
  if (meeting.minutesGenerationId && meeting.minutesGenerationExpiresAt && meeting.minutesGenerationExpiresAt > new Date()) throw new BusinessError("MINUTES_GENERATION_CONFLICT", 409, "議事録を生成中です。");
  const [row] = await tx.select(minutesSelection).from(meetingMinutes).where(eq(meetingMinutes.id, minutesId)).for("update");
  if (row.status === "approved") throw new BusinessError("MINUTES_APPROVED", 409, "承認済み議事録は編集できません。新しいVersionを生成してください。");
  const context = await loadMeetingAIContext(userId, row.meetingId, tx);
  const validated = validateMinutes(minutesDocument({ ...row, ...data }), context, true);
  await tx.update(meetingMinutes).set({ ...contentColumns(validated), status: approve ? "approved" : "review" }).where(eq(meetingMinutes.id, minutesId));
  await writeAuditLog({ organizationId: access.organizationId, userId, action: approve ? AUDIT_ACTIONS.MINUTES_APPROVE : AUDIT_ACTIONS.MINUTES_UPDATE, resourceType: "minutes", resourceId: minutesId, metadata: { meetingId: row.meetingId, version: row.version, changedFields: approve ? ["status"] : (["summary", "decisions", "actionItems", "issues", "pendingItems"] as const).filter((key) => key in data) } }, tx);
  return getMinutes(userId, minutesId, tx);
 });
}
export const updateMinutes = (userId: string, minutesId: string, input: unknown, db = getDb()) => mutateMinutes(userId, minutesId, input, false, db);
export const approveMinutes = (userId: string, minutesId: string, db = getDb()) => mutateMinutes(userId, minutesId, {}, true, db);

export async function listMinutesEvidence(userId: string, meetingId: string, db: MeetingReadDb = getDb()) {
 await requireMeetingAccess({ userId, meetingId }, db);
 const rows = await db.select({ id: meetingTranscripts.id, sequenceNo: meetingTranscripts.sequenceNo, speakerName: meetingTranscripts.speakerName, startedAt: meetingTranscripts.startedAt, endedAt: meetingTranscripts.endedAt, text: meetingTranscripts.text }).from(meetingTranscripts).where(eq(meetingTranscripts.meetingId, meetingId)).orderBy(meetingTranscripts.sequenceNo);
 return rows.map((r) => ({ ...r, startedAt: Number(r.startedAt), endedAt: r.endedAt === null ? null : Number(r.endedAt) }));
}
