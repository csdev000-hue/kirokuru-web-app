import { logEvent } from "@/lib/logging/logger";
import "server-only";
import { z } from "zod";
const metricSchema = z.object({ requestId: z.uuid(), meetingId: z.uuid(), modelId: z.string().max(2048), promptVersion: z.string().max(50), schemaVersion: z.string().max(50), durationMs: z.number().nonnegative(), inputBytes: z.number().nonnegative(), outputBytes: z.number().nonnegative(), transportRetryCount: z.number().int().nonnegative(), schemaRepairCount: z.number().int().nonnegative(), inputTokens: z.number().nonnegative(), outputTokens: z.number().nonnegative(), result: z.string().regex(/^[A-Z_]+$/) }).strict();
export function logAIMetric(value: z.input<typeof metricSchema>) { logEvent({ event: "ai_minutes", ...metricSchema.parse(value) }); }

const candidateMetricSchema = metricSchema.extend({ minutesId: z.uuid(), candidateCount: z.number().int().min(0).max(50) }).strict();
export function logCandidateMetric(value: z.input<typeof candidateMetricSchema>) { logEvent({ event: "ai_ticket_candidate", ...candidateMetricSchema.parse(value) }); }
