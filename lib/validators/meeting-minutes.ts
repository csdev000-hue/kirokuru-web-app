import { z } from "zod";
import { minutesContentSchema } from "@/lib/ai/schemas/minutes";
export const generateMinutesSchema = z.object({ meetingId: z.uuid(), regenerate: z.boolean().default(false) }).strict();
export const editMinutesSchema = z.object({ summary: minutesContentSchema.shape.summary.optional(), decisions: minutesContentSchema.shape.decisions.optional(), actionItems: minutesContentSchema.shape.action_items.optional(), issues: minutesContentSchema.shape.issues.optional(), pendingItems: minutesContentSchema.shape.pending_items.optional() }).strict().refine((v) => Object.keys(v).length > 0);
export const minutesQuerySchema = z.object({ version: z.coerce.number().int().positive().optional() }).strict();
