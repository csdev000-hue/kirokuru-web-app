import { AUDIT_ACTIONS } from "@/lib/security/audit-actions";
import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { candidateGenerations, meetingMinutes, meetings, ticketCandidates } from "@/lib/db/schema";
import { requireMeetingAccess } from "@/lib/permissions/resource";
import { BusinessError, validationError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/security/audit";
import { lockActiveProject } from "@/lib/services/ticket-service";
import { loadCandidateContext } from "@/lib/services/ticket-candidate-context";
import { getTicketCandidate } from "@/lib/services/ticket-candidate-service";
import { getAISettings } from "@/lib/bedrock/settings";
import { createStructuredAIClient } from "@/lib/bedrock/structured-ai-client";
import type { AIMetrics, StructuredGenerator } from "@/lib/bedrock/types";
import { aiError } from "@/lib/bedrock/errors";
import { ticketCandidateAIResultSchema, TICKET_CANDIDATE_SCHEMA_VERSION } from "../schemas/ticket-candidate";
import { ticketCandidateSystemPrompt, TICKET_CANDIDATE_PROMPT_VERSION } from "../prompts/ticket-candidate-system";
import { ticketCandidateUserPrompt } from "../prompts/ticket-candidate-user";
import { validateTicketCandidates } from "../validators/ticket-candidate-business-validator";
import { logCandidateMetric } from "../metrics";
const conflict = () => new BusinessError("AI_TICKET_GENERATION_CONFLICT", 409, "チケット候補を生成中です。しばらく待って再試行してください。");
export async function generateTicketCandidates(input: { userId: string; meetingId: string; minutesId?: string; regenerate?: boolean; requestId?: string; idempotencyKey?: string }, dependencies: { db?: ReturnType<typeof getDb>; client?: StructuredGenerator; settings?: ReturnType<typeof getAISettings> } = {}) {
 const db = dependencies.db ?? getDb(); const key = input.idempotencyKey ?? crypto.randomUUID(); if (!z.uuid().safeParse(key).success) throw validationError();
 const leaseToken = crypto.randomUUID(); const requestId = input.requestId ?? crypto.randomUUID();
 const start = await db.transaction(async (tx) => {
  const access = await requireMeetingAccess({ userId: input.userId, meetingId: input.meetingId, minimumRole: "member" }, tx); await lockActiveProject(access.projectId, tx);
  await tx.select({ id: meetings.id }).from(meetings).where(eq(meetings.id, input.meetingId)).for("update");
  const [minutes] = await tx.select({ id: meetingMinutes.id }).from(meetingMinutes).where(and(eq(meetingMinutes.meetingId, input.meetingId), input.minutesId ? eq(meetingMinutes.id, input.minutesId) : undefined)).orderBy(desc(meetingMinutes.version)).limit(1);
  if (!minutes) throw new BusinessError("MINUTES_NOT_APPROVED", 422, "対象会議の承認済み議事録を選択してください。");
  const context = await loadCandidateContext(input.userId, input.meetingId, minutes.id, tx);
  const history = await tx.select().from(candidateGenerations).where(eq(candidateGenerations.minutesId, minutes.id)).orderBy(desc(candidateGenerations.createdAt));
  const previous = history.find((g) => g.requestKey === key);
  if (previous?.status === "completed") return { context, access, generationId: previous.id, cached: true };
  if (history.some((g) => g.status === "processing" && g.expiresAt > new Date())) throw conflict();
  const latest = history.find((g) => g.status === "completed");
  if (!input.regenerate && latest) return { context, access, generationId: latest.id, cached: true };
  await tx.update(candidateGenerations).set({ status: "failed" }).where(and(eq(candidateGenerations.minutesId, minutes.id), eq(candidateGenerations.status, "processing")));
  const values = { minutesId: minutes.id, requestKey: key, leaseToken, expiresAt: new Date(Date.now() + 120000), status: "processing" as const };
  const [generation] = previous ? await tx.update(candidateGenerations).set(values).where(eq(candidateGenerations.id, previous.id)).returning() : await tx.insert(candidateGenerations).values(values).returning();
  return { context, access, generationId: generation.id, cached: false, regenerate: !!latest };
 });
 const readResult = async (reader: Pick<ReturnType<typeof getDb>, "select">) => { const ids = await reader.select({ id: ticketCandidates.id }).from(ticketCandidates).where(eq(ticketCandidates.generationId, start.generationId)).orderBy(ticketCandidates.id); return { generationId: start.generationId, minutesId: start.context.minutes.id, candidates: await Promise.all(ids.map((c) => getTicketCandidate(input.userId, c.id, reader))) }; };
 if (start.cached) return readResult(db);
 const startedAt = Date.now(); const metrics: AIMetrics = { transportRetryCount: 0, schemaRepairCount: 0, inputTokens: 0, outputTokens: 0, outputBytes: 0 }; let modelId = "unconfigured"; let inputBytes = 0; let resultCode = "SUCCESS"; let candidateCount = 0;
 try {
  const settings = dependencies.settings ?? getAISettings(); modelId = settings.modelId;
  const userPrompt = ticketCandidateUserPrompt(start.context); inputBytes = Buffer.byteLength(userPrompt + ticketCandidateSystemPrompt + JSON.stringify(z.toJSONSchema(ticketCandidateAIResultSchema)));
  if (inputBytes > settings.maxInputBytes) throw aiError("AI_CONTEXT_TOO_LARGE");
  const generated = await (dependencies.client ?? createStructuredAIClient({ settings, metrics })).generateStructured({ systemPrompt: ticketCandidateSystemPrompt, userPrompt, schema: ticketCandidateAIResultSchema, temperature: 0.1 });
  Object.assign(metrics, generated.metrics); modelId = generated.modelId;
  validateTicketCandidates(generated.data, start.context);
  return await db.transaction(async (tx) => {
   const access = await requireMeetingAccess({ userId: input.userId, meetingId: input.meetingId, minimumRole: "member" }, tx); await lockActiveProject(access.projectId, tx);
   await tx.select({ id: meetings.id }).from(meetings).where(eq(meetings.id, input.meetingId)).for("update");
   const [generation] = await tx.select().from(candidateGenerations).where(eq(candidateGenerations.id, start.generationId)).for("update");
   if (generation.status !== "processing" || generation.leaseToken !== leaseToken || generation.expiresAt <= new Date()) throw conflict();
   const context = await loadCandidateContext(input.userId, input.meetingId, start.context.minutes.id, tx);
   const candidates = validateTicketCandidates(generated.data, context); candidateCount = candidates.length;
   if (candidates.length) await tx.insert(ticketCandidates).values(candidates.map((c) => ({ generationId: generation.id, projectId: access.projectId, meetingId: input.meetingId, minutesId: context.minutes.id, title: c.title, description: c.description, type: c.type, priority: c.priority, assigneeId: c.assignee?.user_id ?? null, dueDate: c.due_date, confidence: c.confidence.toFixed(4), sourceTranscriptIds: c.source_evidence.map((e) => e.transcript_id), sourceQuote: context.transcripts.find((t) => t.id === c.source_evidence[0].transcript_id)!.text.slice(0, 300), status: "pending" as const, registeredTicketId: null, aiModel: modelId, promptVersion: TICKET_CANDIDATE_PROMPT_VERSION, schemaVersion: TICKET_CANDIDATE_SCHEMA_VERSION })));
   await tx.update(candidateGenerations).set({ status: "completed" }).where(eq(candidateGenerations.id, generation.id));
   const metadata = { meetingId: input.meetingId, minutesId: context.minutes.id, generationId: generation.id, candidateCount, modelId, promptVersion: TICKET_CANDIDATE_PROMPT_VERSION, schemaVersion: TICKET_CANDIDATE_SCHEMA_VERSION };
   await writeAuditLog({ organizationId: access.organizationId, userId: input.userId, action: AUDIT_ACTIONS.AI_TICKET_CANDIDATE_GENERATE, resourceType: "minutes", resourceId: context.minutes.id, metadata }, tx);
   if (start.regenerate) await writeAuditLog({ organizationId: access.organizationId, userId: input.userId, action: AUDIT_ACTIONS.TICKET_CANDIDATE_REGENERATE, resourceType: "minutes", resourceId: context.minutes.id, metadata }, tx);
   return readResult(tx);
  });
 } catch (error) {
  const code = error instanceof BusinessError ? error.code : "AI_PROVIDER_ERROR";
  const safeError = code === "AI_INVALID_JSON" ? new BusinessError("AI_TICKET_INVALID_JSON", 502, "AI候補のJSON生成に失敗しました。") : code === "AI_SCHEMA_INVALID" ? new BusinessError("AI_TICKET_SCHEMA_INVALID", 502, "AI候補の構造が不正です。") : error instanceof BusinessError ? error : aiError("AI_PROVIDER_ERROR"); resultCode = safeError.code;
  await db.transaction(async (tx) => {
   const changed = await tx.update(candidateGenerations).set({ status: "failed" }).where(and(eq(candidateGenerations.id, start.generationId), eq(candidateGenerations.leaseToken, leaseToken), eq(candidateGenerations.status, "processing"))).returning({ id: candidateGenerations.id });
   if (changed.length) await writeAuditLog({ organizationId: start.access.organizationId, userId: input.userId, action: AUDIT_ACTIONS.AI_TICKET_CANDIDATE_GENERATE_FAILED, resourceType: "minutes", resourceId: start.context.minutes.id, metadata: { meetingId: input.meetingId, minutesId: start.context.minutes.id, generationId: start.generationId, errorCode: resultCode } }, tx);
  });
  throw safeError;
 } finally { logCandidateMetric({ requestId, meetingId: input.meetingId, minutesId: start.context.minutes.id, modelId, promptVersion: TICKET_CANDIDATE_PROMPT_VERSION, schemaVersion: TICKET_CANDIDATE_SCHEMA_VERSION, durationMs: Date.now() - startedAt, inputBytes, ...metrics, candidateCount, result: resultCode }); }
}
