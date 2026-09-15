import { z } from "zod";
// PostgreSQL numeric(12,3), with no silent rounding of user input.
const seconds = z.number().min(0).max(999999999.999).refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 0.00001);
const fields = { speakerUserId: z.uuid().nullable().optional(), speakerName: z.string().trim().min(1).max(100), startedAt: seconds, endedAt: seconds.nullable().optional(), text: z.string().trim().min(1).max(10000), sequenceNo: z.number().int().min(1).max(2147483647) };
export const createTranscriptSchema = z.object(fields).strict().refine((v) => v.endedAt == null || v.endedAt >= v.startedAt);
export const updateTranscriptSchema = z.object(fields).partial().strict().refine((v) => Object.keys(v).length > 0);
export const bulkTranscriptSchema = z.object({ transcripts: z.array(createTranscriptSchema).min(1).max(500) }).strict();
export const transcriptQuerySchema = z.object({ fromSequence: z.coerce.number().int().min(1).max(2147483647).default(1), limit: z.coerce.number().int().min(1).max(500).default(100) }).strict();
