import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { organizations, organizationMembers, projects, projectMembers, users } from "@/lib/db/schema";
import { requireOrganizationMember } from "@/lib/permissions/organization";
import { requireProjectOwner, requireProjectViewer } from "@/lib/permissions/project";
import { AccessError } from "@/lib/permissions/errors";
import { writeAuditLog } from "@/lib/security/audit";
import { validationError } from "@/lib/api/errors";
import { createProjectSchema, updateProjectSchema } from "@/lib/validators/project";
type ReadDb = Pick<ReturnType<typeof getDb>, "select">;
const selection = { id: projects.id, organizationId: projects.organizationId, name: projects.name, description: projects.description, status: projects.status, createdAt: projects.createdAt, updatedAt: projects.updatedAt, role: projectMembers.role };
export async function listProjects(userId: string, organizationId?: string, db: ReadDb = getDb()) {
  if (organizationId) await requireOrganizationMember({ userId, organizationId }, db);
  return db.select(selection).from(projects)
    .innerJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)))
    .innerJoin(organizationMembers, and(eq(organizationMembers.organizationId, projects.organizationId), eq(organizationMembers.userId, userId)))
    .innerJoin(organizations, eq(organizations.id, projects.organizationId))
    .where(and(isNull(organizations.deletedAt), organizationId ? eq(projects.organizationId, organizationId) : undefined)).orderBy(desc(projects.updatedAt), desc(projects.id));
}
export async function getProject(userId: string, projectId: string, db: ReadDb = getDb()) {
  await requireProjectViewer({ userId, projectId }, db);
  const [row] = await db.select(selection).from(projects).innerJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId))).where(eq(projects.id, projectId));
  if (!row) throw new AccessError("RESOURCE_NOT_FOUND");
  return row;
}
export async function listProjectMembers(userId: string, projectId: string, db: ReadDb = getDb()) {
  const membership = await requireProjectViewer({ userId, projectId }, db);
  return db.select({ userId: users.id, name: users.name, email: users.email, role: projectMembers.role }).from(projectMembers).innerJoin(users, eq(users.id, projectMembers.userId))
    .innerJoin(organizationMembers, and(eq(organizationMembers.userId, users.id), eq(organizationMembers.organizationId, membership.organizationId)))
    .where(eq(projectMembers.projectId, projectId)).orderBy(users.name, users.id);
}
export async function createProject(userId: string, input: unknown, db = getDb()) {
  const result = createProjectSchema.safeParse(input);
  if (!result.success) throw validationError();
  const { name, description, organizationId } = result.data;
  return db.transaction(async (tx) => {
    await requireOrganizationMember({ userId, organizationId }, tx);
    const [organization] = await tx.select({ id: organizations.id }).from(organizations).where(and(eq(organizations.id, organizationId), isNull(organizations.deletedAt))).for("update");
    if (!organization) throw new AccessError("RESOURCE_NOT_FOUND");
    const [row] = await tx.insert(projects).values({ name, description, organizationId, createdBy: userId, status: "active" }).returning({ id: projects.id });
    await tx.insert(projectMembers).values({ projectId: row.id, userId, role: "owner" });
    await writeAuditLog({ organizationId, userId, action: "project.create", resourceType: "project", resourceId: row.id }, tx);
    return getProject(userId, row.id, tx);
  });
}
export async function updateProject(userId: string, projectId: string, input: unknown, db = getDb()) {
  const result = updateProjectSchema.safeParse(input);
  if (!result.success) throw validationError();
  const data = result.data;
  return db.transaction(async (tx) => {
    const membership = await requireProjectOwner({ userId, projectId }, tx);
    await tx.update(projects).set({ ...(data.name !== undefined ? { name: data.name } : {}), ...(data.description !== undefined ? { description: data.description } : {}), ...(data.status !== undefined ? { status: data.status } : {}) }).where(eq(projects.id, projectId));
    const changedFields = (["name", "description", "status"] as const).filter((key) => data[key] !== undefined);
    await writeAuditLog({ organizationId: membership.organizationId, userId, action: data.status === "archived" ? "project.archive" : "project.update", resourceType: "project", resourceId: projectId, metadata: { changedFields } }, tx);
    return getProject(userId, projectId, tx);
  });
}
/** DELETE preserves all related resources and records the actual archive operation. */
export const deleteProject = (userId: string, projectId: string, db = getDb()) => updateProject(userId, projectId, { status: "archived" }, db);
