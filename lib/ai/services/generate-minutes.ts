import { AUDIT_ACTIONS } from "@/lib/security/audit-actions";
import "server-only";
import { and, eq, max, desc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { meetings, meetingMinutes } from "@/lib/db/schema";
import { requireMeetingAccess } from "@/lib/permissions/resource";
import { BusinessError, validationError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/security/audit";
import { loadMeetingAIContext } from "@/lib/services/meeting-ai-context";
import { lockActiveProject } from "@/lib/services/ticket-service";
import { contentColumns, getMinutes } from "@/lib/services/meeting-minutes-service";
import { getAISettings } from "@/lib/bedrock/settings";
import { createStructuredAIClient } from "@/lib/bedrock/structured-ai-client";
import type { StructuredGenerator, AIMetrics } from "@/lib/bedrock/types";
import { aiError } from "@/lib/bedrock/errors";
import { minutesAIResultSchema, MINUTES_SCHEMA_VERSION } from "../schemas/minutes";
import { minutesSystemPrompt, MINUTES_PROMPT_VERSION } from "../prompts/minutes-system";
import { minutesUserPrompt } from "../prompts/minutes-user";
import { validateMinutes } from "../validators/minutes-business-validator";
import { logAIMetric } from "../metrics";
const conflict = () => new BusinessError("MINUTES_GENERATION_CONFLICT", 409, "議事録を生成中です。しばらく待って再試行してください。");
export async function generateMeetingMinutes(input: { userId: string; meetingId: string; regenerate?: boolean; requestId?: string; idempotencyKey?: string }, dependencies: { db?: ReturnType<typeof getDb>; client?: StructuredGenerator; settings?: ReturnType<typeof getAISettings> } = {}) {
 const db = dependencies.db ?? getDb(); const requestId = input.requestId ?? crypto.randomUUID(); const key = input.idempotencyKey ?? crypto.randomUUID(); if (!z.uuid().safeParse(key).success) throw validationError();
 const token = crypto.randomUUID();
 const start = await db.transaction(async (tx) => {
  const access = await requireMeetingAccess({ userId: input.userId, meetingId: input.meetingId, minimumRole: "member" }, tx); await lockActiveProject(access.projectId, tx);
  const [meeting] = await tx.select().from(meetings).where(eq(meetings.id, input.meetingId)).for("update");
  const [previous] = await tx.select({ id: meetingMinutes.id }).from(meetingMinutes).where(and(eq(meetingMinutes.meetingId, meeting.id), eq(meetingMinutes.generationKey, key))).limit(1);
  if (previous) return { cachedId: previous.id };
  if (meeting.liveStartedAt && (!meeting.liveEndedAt || meeting.status !== "completed")) throw new BusinessError("MEETING_INVALID_STATUS", 409, "オンライン会議を終了してから議事録を生成してください。");
  if (meeting.minutesGenerationId && meeting.minutesGenerationExpiresAt && meeting.minutesGenerationExpiresAt > new Date()) throw conflict();
  const [latest] = await tx.select({ id: meetingMinutes.id }).from(meetingMinutes).where(eq(meetingMinutes.meetingId, meeting.id)).orderBy(desc(meetingMinutes.version)).limit(1);
  if (latest && !input.regenerate) return { cachedId: latest.id };
  if (meeting.status === "recording") throw new BusinessError("INVALID_TRANSITION", 409, "会議の記録を終了してから議事録を生成してください。");
  const context = await loadMeetingAIContext(input.userId, meeting.id, tx);
  if (!context.transcripts.length) throw new BusinessError("TRANSCRIPT_REQUIRED", 422, "文字起こしを登録してください。");
  await tx.update(meetings).set({ minutesGenerationId: token, minutesGenerationExpiresAt: new Date(Date.now() + 120000), status: "processing" }).where(eq(meetings.id, meeting.id));
  return { context, access };
 });
 if (start.cachedId) return getMinutes(input.userId, start.cachedId, db);
 const startedAt = Date.now(); const metrics: AIMetrics = { transportRetryCount: 0, schemaRepairCount: 0, inputTokens: 0, outputTokens: 0, outputBytes: 0 }; let modelId = "unconfigured"; let inputBytes = 0; let resultCode = "SUCCESS";
 try {
  const settings = dependencies.settings ?? getAISettings(); modelId = settings.modelId;
  const userPrompt = minutesUserPrompt(start.context!); inputBytes = Buffer.byteLength(userPrompt + minutesSystemPrompt + JSON.stringify(z.toJSONSchema(minutesAIResultSchema)));
  if (inputBytes > settings.maxInputBytes) throw aiError("AI_CONTEXT_TOO_LARGE");
  const generator = dependencies.client ?? createStructuredAIClient({ settings, metrics });
  const generated = await generator.generateStructured({ systemPrompt: minutesSystemPrompt, userPrompt, schema: minutesAIResultSchema, temperature: 0.1 });
  Object.assign(metrics, generated.metrics); modelId = generated.modelId;
  const validated = validateMinutes(generated.data, start.context!);
  return await db.transaction(async (tx) => {
   const access = await requireMeetingAccess({ userId: input.userId, meetingId: input.meetingId, minimumRole: "member" }, tx); await lockActiveProject(access.projectId, tx);
   const [meeting] = await tx.select().from(meetings).where(eq(meetings.id, input.meetingId)).for("update");
   if (meeting.minutesGenerationId !== token || !meeting.minutesGenerationExpiresAt || meeting.minutesGenerationExpiresAt <= new Date()) throw conflict();
   const currentContext = await loadMeetingAIContext(input.userId, meeting.id, tx);
   const content = validateMinutes(validated, currentContext);
   const [highest] = await tx.select({ version: max(meetingMinutes.version) }).from(meetingMinutes).where(eq(meetingMinutes.meetingId, meeting.id));
   const version = (highest.version ?? 0) + 1;
   const [row] = await tx.insert(meetingMinutes).values({ meetingId: meeting.id, generationKey: key, version, status: "review", ...contentColumns(content), aiModel: modelId, promptVersion: MINUTES_PROMPT_VERSION, schemaVersion: MINUTES_SCHEMA_VERSION, aiRawOutput: null, createdBy: input.userId }).returning({ id: meetingMinutes.id });
   const metadata = { meetingId: meeting.id, minutesId: row.id, version, modelId, promptVersion: MINUTES_PROMPT_VERSION, schemaVersion: MINUTES_SCHEMA_VERSION };
   await writeAuditLog({ organizationId: access.organizationId, userId: input.userId, action: AUDIT_ACTIONS.AI_MINUTES_GENERATE, resourceType: "minutes", resourceId: row.id, metadata }, tx);
   if (version > 1) await writeAuditLog({ organizationId: access.organizationId, userId: input.userId, action: AUDIT_ACTIONS.MINUTES_REGENERATE, resourceType: "minutes", resourceId: row.id, metadata }, tx);
   await tx.update(meetings).set({ status: "completed", minutesGenerationId: null, minutesGenerationExpiresAt: null }).where(eq(meetings.id, meeting.id));
   return getMinutes(input.userId, row.id, tx);
  });
 } catch (error) {
  resultCode = error instanceof BusinessError ? error.code : "AI_PROVIDER_ERROR";
  // Token comparison prevents an expired worker from changing a newer generation.
  await db.transaction(async (tx) => {
   const [row] = await tx.update(meetings).set({ status: "failed", minutesGenerationId: null, minutesGenerationExpiresAt: null }).where(and(eq(meetings.id, input.meetingId), eq(meetings.minutesGenerationId, token))).returning({ id: meetings.id });
   if (row) await writeAuditLog({ organizationId: start.access!.organizationId, userId: input.userId, action: AUDIT_ACTIONS.AI_MINUTES_GENERATE_FAILED, resourceType: "meeting", resourceId: row.id, metadata: { meetingId: row.id, errorCode: resultCode } }, tx);
  });
  throw error instanceof BusinessError ? error : aiError("AI_PROVIDER_ERROR");
 } finally { logAIMetric({ requestId, meetingId: input.meetingId, modelId, promptVersion: MINUTES_PROMPT_VERSION, schemaVersion: MINUTES_SCHEMA_VERSION, durationMs: Date.now() - startedAt, inputBytes, ...metrics, result: resultCode }); }
}
