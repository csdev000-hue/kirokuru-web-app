import { AUDIT_ACTIONS } from "@/lib/security/audit-actions";
import "server-only";
import { getTicketSource } from "./ticket-source-service";
import { and, asc, count, desc, eq, gte, ilike, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db/client";
import { tickets, projects, users } from "@/lib/db/schema";
import { requireProjectViewer, requireProjectMember, getProjectMembership } from "@/lib/permissions/project";
import { requireTicketAccess } from "@/lib/permissions/resource";
import { AccessError } from "@/lib/permissions/errors";
import { BusinessError, validationError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/security/audit";
import { createTicketSchema, updateTicketSchema, ticketListQuerySchema } from "@/lib/validators/ticket";
type ReadDb = Pick<ReturnType<typeof getDb>, "select">;
const assignee = alias(users, "assignee"); const creator = alias(users, "creator");
const selection = { id: tickets.id, projectId: tickets.projectId, title: tickets.title, description: tickets.description, type: tickets.type, priority: tickets.priority, status: tickets.status, assignee: { id: assignee.id, name: assignee.name }, createdBy: { id: creator.id, name: creator.name }, dueDate: tickets.dueDate, sourceMeetingId: tickets.sourceMeetingId, sourceCandidateId: tickets.sourceCandidateId, createdAt: tickets.createdAt, updatedAt: tickets.updatedAt };
const query = (db: ReadDb) => db.select(selection).from(tickets).leftJoin(assignee, eq(assignee.id, tickets.assigneeId)).innerJoin(creator, eq(creator.id, tickets.createdBy));
export async function listTickets(userId: string, projectId: string, input: unknown = {}, db = getDb()) {
 await requireProjectViewer({ userId, projectId }, db);
 const parsed = ticketListQuerySchema.safeParse(input); if (!parsed.success) throw validationError(); const f = parsed.data;
 const pattern = f.q ? `%${f.q.replace(/[\\%_]/g, "\\$&")}%` : undefined;
 const where = and(eq(tickets.projectId, projectId), isNull(tickets.deletedAt), f.status ? eq(tickets.status, f.status) : undefined, f.type ? eq(tickets.type, f.type) : undefined, f.priority ? eq(tickets.priority, f.priority) : undefined, f.assigneeId ? eq(tickets.assigneeId, f.assigneeId) : undefined, pattern ? or(ilike(tickets.title, pattern), ilike(tickets.description, pattern)) : undefined, f.dueFrom ? gte(tickets.dueDate, f.dueFrom) : undefined, f.dueTo ? lte(tickets.dueDate, f.dueTo) : undefined);
 const columns = { updatedAt: tickets.updatedAt, createdAt: tickets.createdAt, dueDate: tickets.dueDate, priority: sql`case ${tickets.priority} when 'low' then 1 when 'medium' then 2 when 'high' then 3 else 4 end` };
 const order = f.order === "asc" ? asc(columns[f.sort]) : desc(columns[f.sort]);
 return db.transaction(async (tx) => { const data = await query(tx).where(where).orderBy(sql`${order} nulls last`, asc(tickets.id)).limit(f.limit).offset((f.page - 1) * f.limit); const [total] = await tx.select({ value: count() }).from(tickets).where(where); return { data, meta: { page: f.page, limit: f.limit, total: total.value, totalPages: Math.ceil(total.value / f.limit) } }; }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
export async function getTicket(userId: string, ticketId: string, db: ReadDb = getDb()) {
 await requireTicketAccess({ userId, ticketId }, db);
 const [row] = await query(db).where(and(eq(tickets.id, ticketId), isNull(tickets.deletedAt))); if (!row) throw new AccessError("RESOURCE_NOT_FOUND"); return { ...row, source: await getTicketSource(userId, row, db) };
}
export async function lockActiveProject(projectId: string, db: ReadDb) {
 const [row] = await db.select({ status: projects.status }).from(projects).where(eq(projects.id, projectId)).for("share");
 if (!row) throw new AccessError("RESOURCE_NOT_FOUND");
 if (row.status === "archived") throw new BusinessError("PROJECT_ARCHIVED", 409, "アーカイブ済みプロジェクトは変更できません。");
}
async function checkAssignee(assigneeId: string | null | undefined, projectId: string, db: ReadDb) {
 if (assigneeId && !await getProjectMembership({ userId: assigneeId, projectId }, db)) throw new BusinessError("INVALID_ASSIGNEE", 422, "担当者はこのプロジェクトのメンバーから選択してください。");
}
export async function createTicket(userId: string, projectId: string, input: unknown, db = getDb()) {
 const parsed = createTicketSchema.safeParse(input); if (!parsed.success) throw validationError();
 return db.transaction(async (tx) => {
  const access = await requireProjectMember({ userId, projectId }, tx); await lockActiveProject(projectId, tx); await checkAssignee(parsed.data.assigneeId, projectId, tx);
  const [row] = await tx.insert(tickets).values({ ...parsed.data, projectId, createdBy: userId, status: "todo", sourceMeetingId: null, sourceCandidateId: null }).returning({ id: tickets.id });
  await writeAuditLog({ organizationId: access.organizationId, userId, action: AUDIT_ACTIONS.TICKET_CREATE, resourceType: "ticket", resourceId: row.id, metadata: { projectId } }, tx); return getTicket(userId, row.id, tx);
 });
}
export async function updateTicket(userId: string, ticketId: string, input: unknown, db = getDb()) {
 const parsed = updateTicketSchema.safeParse(input); if (!parsed.success) throw validationError();
 return db.transaction(async (tx) => {
  const access = await requireTicketAccess({ userId, ticketId, minimumRole: "member" }, tx); await lockActiveProject(access.projectId, tx); await checkAssignee(parsed.data.assigneeId, access.projectId, tx);
  const [row] = await tx.update(tickets).set(parsed.data).where(and(eq(tickets.id, ticketId), isNull(tickets.deletedAt))).returning({ id: tickets.id }); if (!row) throw new AccessError("RESOURCE_NOT_FOUND");
  const changedFields = (["title", "description", "type", "status", "priority", "assigneeId", "dueDate"] as const).filter((key) => parsed.data[key] !== undefined);
  await writeAuditLog({ organizationId: access.organizationId, userId, action: AUDIT_ACTIONS.TICKET_UPDATE, resourceType: "ticket", resourceId: ticketId, metadata: { projectId: access.projectId, changedFields } }, tx); return getTicket(userId, ticketId, tx);
 });
}
export async function deleteTicket(userId: string, ticketId: string, db = getDb()) {
 return db.transaction(async (tx) => {
  const access = await requireTicketAccess({ userId, ticketId, minimumRole: "member" }, tx); await lockActiveProject(access.projectId, tx);
  const [row] = await tx.update(tickets).set({ deletedAt: new Date() }).where(and(eq(tickets.id, ticketId), isNull(tickets.deletedAt))).returning({ id: tickets.id }); if (!row) throw new AccessError("RESOURCE_NOT_FOUND");
  await writeAuditLog({ organizationId: access.organizationId, userId, action: AUDIT_ACTIONS.TICKET_DELETE, resourceType: "ticket", resourceId: ticketId, metadata: { projectId: access.projectId } }, tx);
 });
}
