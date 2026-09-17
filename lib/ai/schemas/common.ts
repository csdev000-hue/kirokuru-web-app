import { z } from "zod";
export const sourceEvidenceSchema = z.object({ transcript_id: z.uuid(), started_at: z.number().min(0), ended_at: z.number().min(0).nullable().optional() }).strict();
