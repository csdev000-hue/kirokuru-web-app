import { AUDIT_ACTIONS } from "@/lib/security/audit-actions";
import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { tickets, ticketComments, users } from "@/lib/db/schema";
import { requireTicketAccess } from "@/lib/permissions/resource";
import { AccessError } from "@/lib/permissions/errors";
import { BusinessError } from "@/lib/api/errors";
import { createCommentSchema } from "@/lib/validators/ticket-comment";
import { writeAuditLog } from "@/lib/security/audit";
import { lockActiveProject } from "./ticket-service";
export async function listTicketComments(userId: string, ticketId: string, db = getDb()) {
 await requireTicketAccess({ userId, ticketId }, db);
 return db.select({ id: ticketComments.id, content: ticketComments.content, author: { id: users.id, name: users.name }, createdAt: ticketComments.createdAt, updatedAt: ticketComments.updatedAt }).from(ticketComments).innerJoin(users, eq(users.id, ticketComments.userId)).innerJoin(tickets, eq(tickets.id, ticketComments.ticketId)).where(and(eq(ticketComments.ticketId, ticketId), isNull(tickets.deletedAt))).orderBy(ticketComments.createdAt, ticketComments.id);
}
export async function createTicketComment(userId: string, ticketId: string, input: unknown, db = getDb()) {
 const parsed = createCommentSchema.safeParse(input); if (!parsed.success) throw new BusinessError("VALIDATION_ERROR", 422, "コメントは1〜5000文字で入力してください。");
 return db.transaction(async (tx) => {
  const access = await requireTicketAccess({ userId, ticketId, minimumRole: "member" }, tx); await lockActiveProject(access.projectId, tx);
  const [ticket] = await tx.select({ id: tickets.id }).from(tickets).where(and(eq(tickets.id, ticketId), isNull(tickets.deletedAt))).for("share"); if (!ticket) throw new AccessError("RESOURCE_NOT_FOUND");
  const [row] = await tx.insert(ticketComments).values({ ticketId, userId, content: parsed.data.content }).returning({ id: ticketComments.id, content: ticketComments.content, createdAt: ticketComments.createdAt });
  await writeAuditLog({ organizationId: access.organizationId, userId, action: AUDIT_ACTIONS.TICKET_COMMENT_CREATE, resourceType: "ticket", resourceId: ticketId, metadata: { projectId: access.projectId } }, tx); return row;
 });
}
