import { logEvent } from "@/lib/logging/logger";
import "server-only";
import { z } from "zod";
const eventSchema = z.object({
  requestId: z.uuid(), userId: z.uuid().optional(),
  resourceType: z.enum(["organization", "project", "ticket", "meeting", "minutes", "candidate"]).optional(),
  resourceId: z.uuid().optional(),
  action: z.enum(["authenticate", "authorize"]),
  result: z.enum(["UNAUTHENTICATED", "FORBIDDEN", "RESOURCE_NOT_FOUND", "INTERNAL_ERROR"]),
}).strict();
export function logSecurityEvent(event: z.input<typeof eventSchema>) {
  const parsed = eventSchema.safeParse(event);
  if (!parsed.success) throw new Error("Invalid security event");
  logEvent({ event: "security", ...parsed.data }, "warn");
}
