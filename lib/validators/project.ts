import { z } from "zod";
const fields = { name: z.string().trim().min(1).max(200), description: z.string().max(5000).nullable().optional() };
export const createProjectSchema = z.object({ ...fields, organizationId: z.uuid() }).strict();
export const updateProjectSchema = z.object({ ...fields, status: z.enum(["active", "archived"]) }).partial().strict().refine((value) => Object.keys(value).length > 0);
export const projectQuerySchema = z.object({ organizationId: z.uuid().optional() }).strict();
