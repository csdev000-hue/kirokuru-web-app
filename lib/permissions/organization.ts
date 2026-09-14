import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { organizationMembers, organizations } from "@/lib/db/schema";
import { AccessError } from "./errors";
import { ORGANIZATION_ROLES } from "./roles";

type Input = { userId: string; organizationId: string };
export async function getOrganizationMembership({ userId, organizationId }: Input, db: Pick<ReturnType<typeof getDb>, "select"> = getDb()) {
  if (!z.uuid().safeParse(userId).success || !z.uuid().safeParse(organizationId).success) return null;
  const [membership] = await db.select({ organizationId: organizationMembers.organizationId, userId: organizationMembers.userId, role: organizationMembers.role, createdAt: organizationMembers.createdAt }).from(organizationMembers).innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId)).where(and(isNull(organizations.deletedAt), eq(organizationMembers.userId, userId), eq(organizationMembers.organizationId, organizationId))).limit(1);
  return membership ?? null;
}
export async function requireOrganizationMember(input: Input, db: Pick<ReturnType<typeof getDb>, "select"> = getDb()) {
  const membership = await getOrganizationMembership(input, db);
  if (!membership) throw new AccessError("RESOURCE_NOT_FOUND");
  return membership;
}
export async function requireOrganizationOwner(input: Input, db: Pick<ReturnType<typeof getDb>, "select"> = getDb()) {
  const membership = await requireOrganizationMember(input, db);
  if (membership.role !== ORGANIZATION_ROLES.OWNER) throw new AccessError("FORBIDDEN");
  return membership;
}
