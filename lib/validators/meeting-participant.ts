import { z } from "zod";
const name = z.string().trim().min(1).max(100);
export const createParticipantSchema = z.object({ userId: z.uuid().nullable().optional(), displayName: name.optional(), role: z.enum(["host", "participant"]).default("participant") }).strict().refine((v) => !!v.userId || !!v.displayName);
// Identity cannot be reassigned. Join/leave are separate current-user operations.
export const updateParticipantSchema = z.object({ displayName: name.optional(), role: z.enum(["host", "participant"]).optional() }).strict().refine((v) => Object.keys(v).length > 0);
