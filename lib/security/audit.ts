import { AUDIT_ACTIONS } from "./audit-actions";
import { requestContext } from "@/lib/logging/context";
import "server-only";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { auditLogs } from "@/lib/db/schema";
const auditSchema = z.object({
  organizationId: z.uuid(), userId: z.uuid().nullable(),
  action: z.enum(AUDIT_ACTIONS),
  resourceType: z.enum(["recording", "organization", "project", "ticket", "meeting", "participant", "transcript", "minutes", "candidate"]),
  resourceId: z.uuid().nullable(),
  metadata: z.object({
    connectionState: z.enum(["reconnecting", "reconnected", "failed", "disconnected"]).optional(),
    participantUserId: z.uuid().optional(),
    role: z.enum(["owner", "member", "viewer"]).optional(),
    recordingId: z.uuid().optional(),
    contentType: z.string().max(100).optional(),
    fileSize: z.number().int().nonnegative().optional(),
    candidateId: z.uuid().optional(),
    ticketId: z.uuid().optional(),
    requestId: z.uuid().optional(),
    generationId: z.uuid().optional(),
    candidateCount: z.number().int().min(0).max(50).optional(),
    minutesId: z.uuid().optional(),
    version: z.number().int().positive().optional(),
    modelId: z.string().min(1).max(2048).optional(),
    promptVersion: z.string().max(50).optional(),
    schemaVersion: z.string().max(50).optional(),
    errorCode: z.string().regex(/^[A-Z0-9_]+$/).max(80).optional(),
    meetingId: z.uuid().optional(),
    from: z.enum(["scheduled", "recording", "processing", "completed", "failed"]).optional(),
    to: z.enum(["scheduled", "recording", "processing", "completed", "failed"]).optional(),
    projectId: z.uuid().optional(),
    changedFields: z.array(z.enum(["summary", "decisions", "actionItems", "issues", "pendingItems", "meetingDate", "displayName", "speakerUserId", "speakerName", "startedAt", "endedAt", "text", "sequenceNo", "joinedAt", "leftAt", "type", "priority", "name", "description", "status", "role", "assigneeId", "dueDate", "title"])).max(20).optional(),
    count: z.number().int().nonnegative().optional(),
    reasonCode: z.enum(["permission_denied", "not_found", "validation_failed"]).optional(),
  }).strict().optional(),
}).strict();
export type AuditInput = z.input<typeof auditSchema>;
export async function writeAuditLog(input: AuditInput, db: Pick<ReturnType<typeof getDb>, "insert"> = getDb()) {
  const parsed = auditSchema.safeParse({ ...input, metadata: { ...input.metadata, requestId: requestContext.getStore()?.requestId ?? input.metadata?.requestId } });
  if (!parsed.success) throw new Error("Invalid audit event");
  const [row] = await db.insert(auditLogs).values(parsed.data).returning({ id: auditLogs.id });
  return row;
}
