import type { z } from "zod";
export type GenerateStructuredOptions<T> = { systemPrompt: string; userPrompt: string; schema: z.ZodType<T>; temperature?: number };
export type AIMetrics = { transportRetryCount: number; schemaRepairCount: number; inputTokens: number; outputTokens: number; outputBytes: number };
export type StructuredResult<T> = { data: T; rawText: string; modelId: string; metrics: AIMetrics };
export interface StructuredGenerator { generateStructured<T>(options: GenerateStructuredOptions<T>): Promise<StructuredResult<T>>; }
