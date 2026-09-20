import { AUDIT_ACTIONS } from "@/lib/security/audit-actions";
import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { organizations, organizationMembers, projects, users } from "@/lib/db/schema";
import { requireOrganizationMember, requireOrganizationOwner } from "@/lib/permissions/organization";
import { AccessError } from "@/lib/permissions/errors";
import { writeAuditLog } from "@/lib/security/audit";
import { BusinessError, validationError } from "@/lib/api/errors";
import { createOrganizationSchema } from "@/lib/validators/organization";
const selection = { id: organizations.id, name: organizations.name, createdAt: organizations.createdAt, updatedAt: organizations.updatedAt, role: organizationMembers.role };
type ReadDb = Pick<ReturnType<typeof getDb>, "select">;
export function listOrganizations(userId: string, db: ReadDb = getDb()) {
  return db.select(selection).from(organizations).innerJoin(organizationMembers, eq(organizationMembers.organizationId, organizations.id)).where(and(eq(organizationMembers.userId, userId), isNull(organizations.deletedAt))).orderBy(desc(organizations.createdAt), desc(organizations.id));
}
export async function getOrganization(userId: string, organizationId: string, db: ReadDb = getDb()) {
  await requireOrganizationMember({ userId, organizationId }, db);
  const [row] = await db.select(selection).from(organizations).innerJoin(organizationMembers, eq(organizationMembers.organizationId, organizations.id)).where(and(eq(organizations.id, organizationId), eq(organizationMembers.userId, userId), isNull(organizations.deletedAt)));
  if (!row) throw new AccessError("RESOURCE_NOT_FOUND");
  return row;
}
export async function listOrganizationMembers(userId: string, organizationId: string, db: ReadDb = getDb()) {
  await requireOrganizationMember({ userId, organizationId }, db);
  return db.select({ userId: users.id, name: users.name, email: users.email, role: organizationMembers.role }).from(organizationMembers).innerJoin(users, eq(users.id, organizationMembers.userId)).where(eq(organizationMembers.organizationId, organizationId)).orderBy(users.name, users.id);
}
export async function createOrganization(userId: string, input: unknown, db = getDb()) {
  const result = createOrganizationSchema.safeParse(input);
  if (!result.success) throw validationError();
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(organizations).values({ name: result.data.name, createdBy: userId }).returning({ id: organizations.id });
    await tx.insert(organizationMembers).values({ organizationId: row.id, userId, role: "owner" });
    await writeAuditLog({ organizationId: row.id, userId, action: AUDIT_ACTIONS.ORGANIZATION_CREATE, resourceType: "organization", resourceId: row.id }, tx);
    return getOrganization(userId, row.id, tx);
  });
}
export async function updateOrganization(userId: string, organizationId: string, input: unknown, db = getDb()) {
  const result = createOrganizationSchema.safeParse(input);
  if (!result.success) throw validationError();
  return db.transaction(async (tx) => {
    await requireOrganizationOwner({ userId, organizationId }, tx);
    const [row] = await tx.update(organizations).set({ name: result.data.name }).where(and(eq(organizations.id, organizationId), isNull(organizations.deletedAt))).returning({ id: organizations.id });
    if (!row) throw new AccessError("RESOURCE_NOT_FOUND");
    await writeAuditLog({ organizationId, userId, action: AUDIT_ACTIONS.ORGANIZATION_UPDATE, resourceType: "organization", resourceId: organizationId, metadata: { changedFields: ["name"] } }, tx);
    return getOrganization(userId, organizationId, tx);
  });
}
export async function deleteOrganization(userId: string, organizationId: string, db = getDb()) {
  return db.transaction(async (tx) => {
    await requireOrganizationOwner({ userId, organizationId }, tx);
    // Serialize deletion with project creation, including projects that are archived.
    const [row] = await tx.select({ id: organizations.id }).from(organizations).where(and(eq(organizations.id, organizationId), isNull(organizations.deletedAt))).for("update");
    if (!row) throw new AccessError("RESOURCE_NOT_FOUND");
    const [project] = await tx.select({ id: projects.id }).from(projects).where(eq(projects.organizationId, organizationId)).limit(1);
    if (project) throw new BusinessError("ORGANIZATION_NOT_EMPTY", 409, "プロジェクトが存在する組織は削除できません。");
    await tx.update(organizations).set({ deletedAt: new Date() }).where(eq(organizations.id, organizationId));
    await writeAuditLog({ organizationId, userId, action: AUDIT_ACTIONS.ORGANIZATION_DELETE, resourceType: "organization", resourceId: organizationId }, tx);
  });
}
