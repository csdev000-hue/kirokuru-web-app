import { z } from "zod";
import { candidateType, candidatePriority } from "@/lib/ai/schemas/ticket-candidate";
export const generateCandidatesSchema = z.object({ meetingId: z.uuid(), minutesId: z.uuid().optional(), regenerate: z.boolean().default(false) }).strict();
export const candidateContentSchema = z.object({ title: z.string().trim().min(1).max(300), description: z.string().trim().max(10000).nullable(), type: candidateType, priority: candidatePriority, assigneeId: z.uuid().nullable(), dueDate: z.iso.date().refine((v) => !v.startsWith("0000")).nullable() }).strict();
export const updateCandidateSchema = candidateContentSchema.partial().strict().refine((v) => Object.keys(v).length > 0);
export const candidateQuerySchema = z.object({ page:z.coerce.number().int().min(1).max(100000).default(1),limit:z.coerce.number().int().min(1).max(100).default(50), status: z.enum(["pending", "approved", "rejected", "registered"]).optional(), minutesId: z.uuid().optional(), type: candidateType.optional(), priority: z.enum(["low", "medium", "high", "urgent"]).optional(), assigneeId: z.uuid().optional() }).strict();
