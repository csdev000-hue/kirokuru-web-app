import "server-only";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { auditLogs } from "@/lib/db/schema";
const auditSchema = z.object({
  organizationId: z.uuid(), userId: z.uuid().nullable(),
  action: z.enum(["organization.delete", "project.archive", "project.delete", "organization.create", "organization.update", "organization.member.add", "organization.member.remove", "project.create", "project.update", "project.member.add", "project.member.remove", "ticket.comment.create", "ticket.create", "ticket.update", "ticket.delete", "meeting.update", "meeting.delete", "meeting.status.change", "meeting.participant.add", "meeting.participant.update", "meeting.participant.remove", "meeting.transcript.create", "meeting.transcript.bulk_create", "meeting.transcript.update", "meeting.transcript.delete", "meeting.create", "meeting.end", "ai.minutes.generate.failed", "minutes.update", "minutes.approve", "minutes.regenerate", "ai.minutes.generate", "ai.ticket.generate", "candidate.approve", "candidate.reject", "ticket.register"]),
  resourceType: z.enum(["organization", "project", "ticket", "meeting", "participant", "transcript", "minutes", "candidate"]),
  resourceId: z.uuid().nullable(),
  metadata: z.object({
    minutesId: z.uuid().optional(),
    version: z.number().int().positive().optional(),
    modelId: z.string().min(1).max(2048).optional(),
    promptVersion: z.string().max(50).optional(),
    schemaVersion: z.string().max(50).optional(),
    errorCode: z.string().regex(/^[A-Z_]+$/).max(80).optional(),
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
  const parsed = auditSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid audit event");
  const [row] = await db.insert(auditLogs).values(parsed.data).returning({ id: auditLogs.id });
  return row;
}
