import { z } from "zod";
export const statuses = ["todo", "in_progress", "blocked", "done"] as const;
export const priorities = ["low", "medium", "high", "urgent"] as const;
export const types = ["task", "issue", "decision", "followup"] as const;
const date = z.iso.date();
const fields = { title: z.string().trim().min(1).max(300), description: z.string().max(10000).nullable().optional(), type: z.enum(types), priority: z.enum(priorities).optional(), assigneeId: z.uuid().nullable().optional(), dueDate: date.nullable().optional() };
export const createTicketSchema = z.object(fields).strict();
export const updateTicketSchema = z.object({ ...fields, status: z.enum(statuses) }).partial().strict().refine((v) => Object.keys(v).length > 0);
export const ticketListQuerySchema = z.object({
 status: z.enum(statuses).optional(), type: z.enum(types).optional(), priority: z.enum(priorities).optional(), assigneeId: z.uuid().optional(), q: z.string().trim().max(300).optional(), dueFrom: date.optional(), dueTo: date.optional(),
 sort: z.enum(["updatedAt", "createdAt", "dueDate", "priority"]).default("updatedAt"), order: z.enum(["asc", "desc"]).default("desc"), page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict().refine((v) => !v.dueFrom || !v.dueTo || v.dueFrom <= v.dueTo);
