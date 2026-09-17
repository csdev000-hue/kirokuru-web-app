import "server-only";
import { z } from "zod";
import { getBedrockEnv } from "@/lib/env";
import { aiError } from "./errors";
export function getAISettings() {
 try {
  const env = getBedrockEnv();
  const limits = z.object({ maxInputBytes: z.coerce.number().int().min(1000).max(200000).default(60000), maxOutputTokens: z.coerce.number().int().min(256).max(8192).default(4096), timeoutMs: z.coerce.number().int().min(1000).max(45000).default(30000) }).parse({ maxInputBytes: process.env.AI_MINUTES_MAX_INPUT_BYTES || undefined, maxOutputTokens: process.env.AI_MINUTES_MAX_OUTPUT_TOKENS || undefined, timeoutMs: process.env.AI_MINUTES_TIMEOUT_MS || undefined });
  if (env.BEDROCK_MODEL_ID.length > 2048) throw new Error();
  return { ...limits, modelId: env.BEDROCK_MODEL_ID, region: env.AWS_REGION };
 } catch { throw aiError("AI_PROVIDER_ERROR"); }
}
