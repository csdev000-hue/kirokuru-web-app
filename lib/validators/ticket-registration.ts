import { z } from "zod";
export const registerCandidateSchema = z.object({}).strict();
export const bulkRegisterSchema = z.object({ candidateIds: z.array(z.uuid()).min(1).max(50).refine((ids) => new Set(ids).size === ids.length, "候補IDが重複しています。") }).strict();
