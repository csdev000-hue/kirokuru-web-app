import { AUDIT_ACTIONS } from "@/lib/security/audit-actions";
import { logEvent } from "@/lib/logging/logger";
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { ticketCandidates, tickets, meetingMinutes, projectMembers, organizationMembers } from "@/lib/db/schema";
import { requireTicketCandidateAccess } from "@/lib/permissions/resource";
import { getProjectMembership } from "@/lib/permissions/project";
import { AccessError } from "@/lib/permissions/errors";
import { BusinessError } from "@/lib/api/errors";
import { bulkRegisterSchema } from "@/lib/validators/ticket-registration";
import { candidateContentSchema } from "@/lib/validators/ticket-candidate";
import { createTicketSchema } from "@/lib/validators/ticket";
import { lockActiveProject } from "./ticket-service";
import { getTicketCandidate } from "./ticket-candidate-service";
import { writeAuditLog } from "@/lib/security/audit";
const conflict = () => new BusinessError("TICKET_REGISTRATION_CONFLICT", 409, "登録状態が一致しません。再読み込みしてください。");
const metricSchema = z.object({ requestId: z.uuid(), candidateId: z.uuid(), ticketId: z.uuid().optional(), projectId: z.uuid().optional(), result: z.string().regex(/^[A-Z_]+$/), durationMs: z.number().nonnegative(), idempotentHit: z.boolean(), conflict: z.boolean() }).strict();
async function register(userId: string, candidateIds: string[], bulk: boolean, requestId: string, db: ReturnType<typeof getDb>) {
 const started = Date.now(); let resultCode = "SUCCESS"; let projectId: string | undefined;
 let result: { candidateId: string; ticketId: string; status: "registered"; existing: boolean; deleted: boolean }[] = [];
 try {
  result = await db.transaction(async (tx) => {
   const ids = [...candidateIds].sort(); const access = [];
   for (const candidateId of ids) access.push(await requireTicketCandidateAccess({ userId, candidateId, minimumRole: "member" }, tx));
   projectId = access[0].projectId;
   if (access.some((a) => a.projectId !== projectId)) throw new BusinessError("BULK_REGISTRATION_INVALID", 422, "同一Projectの候補を選択してください。");
   await lockActiveProject(projectId, tx);
   const candidates = await tx.select().from(ticketCandidates).where(inArray(ticketCandidates.id, ids)).orderBy(ticketCandidates.id).for("update");
   if (candidates.length !== ids.length) throw new AccessError("RESOURCE_NOT_FOUND");
   // Validate every candidate before any INSERT. Lock order is Project → sorted Candidate IDs.
   const prepared = [];
   for (const c of candidates) {
    await requireTicketCandidateAccess({ userId, candidateId: c.id, minimumRole: "member" }, tx);
    if (c.projectId !== projectId) throw conflict();
    const [existing] = await tx.select().from(tickets).where(eq(tickets.sourceCandidateId, c.id));
    if (c.status === "registered" || c.registeredTicketId || existing) {
     if (c.status !== "registered" || !existing || c.registeredTicketId !== existing.id || existing.projectId !== c.projectId || existing.sourceMeetingId !== c.meetingId) throw conflict();
     if (bulk) throw new BusinessError("TICKET_CANDIDATE_ALREADY_REGISTERED", 409, "登録済み候補が含まれています。");
     return [{ candidateId: c.id, ticketId: existing.id, status: "registered" as const, existing: true, deleted: existing.deletedAt !== null }];
    }
    if (c.status !== "approved") throw new BusinessError("TICKET_CANDIDATE_NOT_APPROVED", 409, "承認済み候補のみ登録できます。");
    if (c.priority === null) throw new BusinessError("TICKET_PRIORITY_REQUIRED", 422, "正式登録には優先度の設定が必要です。");
    const parsed = candidateContentSchema.safeParse({ title: c.title, description: c.description, type: c.type, priority: c.priority, assigneeId: c.assigneeId, dueDate: c.dueDate });
    if (!parsed.success) throw new BusinessError("BULK_REGISTRATION_INVALID", 422, "候補の入力内容を確認してください。");
    if (c.assigneeId) {
     await tx.select().from(projectMembers).where(and(eq(projectMembers.projectId, c.projectId), eq(projectMembers.userId, c.assigneeId))).for("share");
     await tx.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, access[0].organizationId), eq(organizationMembers.userId, c.assigneeId))).for("share");
     if (!await getProjectMembership({ userId: c.assigneeId, projectId: c.projectId }, tx)) throw new BusinessError("INVALID_ASSIGNEE", 422, "担当者のProject所属を確認してください。");
    }
    const candidate = await getTicketCandidate(userId, c.id, tx);
    const [minutes] = await tx.select({ status: meetingMinutes.status }).from(meetingMinutes).where(eq(meetingMinutes.id, candidate.minutesId));
    if (minutes?.status !== "approved") throw new BusinessError("MINUTES_NOT_APPROVED", 422, "元の議事録が未承認です。");
    const fields = createTicketSchema.parse(parsed.data);
    prepared.push({ c, fields, minutesId: candidate.minutesId });
   }
   const registered = [];
   for (const { c, fields, minutesId } of prepared) {
    const [ticket] = await tx.insert(tickets).values({ ...fields, priority: c.priority!, projectId: c.projectId, createdBy: userId, status: "todo", sourceCandidateId: c.id, sourceMeetingId: c.meetingId }).returning({ id: tickets.id });
    const updated = await tx.update(ticketCandidates).set({ status: "registered", registeredTicketId: ticket.id }).where(and(eq(ticketCandidates.id, c.id), eq(ticketCandidates.status, "approved"))).returning({ id: ticketCandidates.id });
    if (updated.length !== 1) throw conflict();
    await writeAuditLog({ organizationId: access[0].organizationId, userId, action: AUDIT_ACTIONS.TICKET_CANDIDATE_REGISTER, resourceType: "candidate", resourceId: c.id, metadata: { candidateId: c.id, ticketId: ticket.id, meetingId: c.meetingId, minutesId, requestId } }, tx);
    registered.push({ candidateId: c.id, ticketId: ticket.id, status: "registered" as const, existing: false, deleted: false });
   }
   return registered;
  });
  return result;
 } catch (error) {
  if (error instanceof BusinessError || error instanceof AccessError) { resultCode = error.code; throw error; }
  const cause = error instanceof Error && error.cause ? error.cause : error;
  const dbCode = (cause as { code?: string })?.code;
  const safe = ["23505", "40P01", "40001"].includes(dbCode ?? "") ? conflict() : new BusinessError("TICKET_REGISTRATION_FAILED", 500, "チケット登録に失敗しました。再試行してください。"); resultCode = safe.code; throw safe;
 } finally {
  for (const candidateId of candidateIds) {
   const row = result.find((r) => r.candidateId === candidateId);
   logEvent({ event: "ticket_registration", ...metricSchema.parse({ requestId, candidateId, ticketId: row?.ticketId, projectId, result: resultCode, durationMs: Date.now() - started, idempotentHit: row?.existing ?? false, conflict: ["TICKET_REGISTRATION_CONFLICT", "TICKET_CANDIDATE_ALREADY_REGISTERED", "TICKET_CANDIDATE_NOT_APPROVED"].includes(resultCode) }) });
  }
 }
}
export async function registerTicketCandidate(input: { userId: string; candidateId: string; requestId?: string }, db = getDb()) {
 if (!z.uuid().safeParse(input.candidateId).success) throw new AccessError("RESOURCE_NOT_FOUND");
 return (await register(input.userId, [input.candidateId], false, input.requestId ?? crypto.randomUUID(), db))[0];
}
export async function bulkRegisterTicketCandidates(input: { userId: string; candidateIds: string[]; requestId?: string }, db = getDb()) {
 const parsed = bulkRegisterSchema.safeParse({ candidateIds: input.candidateIds }); if (!parsed.success) throw new BusinessError("BULK_REGISTRATION_INVALID", 422, "1〜50件の重複しない候補IDを指定してください。");
 return { registered: await register(input.userId, parsed.data.candidateIds, true, input.requestId ?? crypto.randomUUID(), db) };
}
