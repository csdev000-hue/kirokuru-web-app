import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { organizations, organizationMembers, projectMembers, projects } from "@/lib/db/schema";
import { AccessError } from "./errors";
import { hasProjectRole, PROJECT_ROLES, type ProjectRole } from "./roles";

type Input = { userId: string; projectId: string };
export async function getProjectMembership({ userId, projectId }: Input, db: Pick<ReturnType<typeof getDb>, "select"> = getDb()) {
  if (!z.uuid().safeParse(userId).success || !z.uuid().safeParse(projectId).success) return null;
  const [membership] = await db.select({ projectId: projects.id, organizationId: projects.organizationId, userId: projectMembers.userId, role: projectMembers.role })
    .from(projectMembers).innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .innerJoin(organizationMembers, and(eq(organizationMembers.organizationId, projects.organizationId), eq(organizationMembers.userId, projectMembers.userId)))
    .innerJoin(organizations, eq(organizations.id, projects.organizationId))
    .where(and(isNull(organizations.deletedAt), eq(projectMembers.userId, userId), eq(projectMembers.projectId, projectId))).limit(1);
  return membership ?? null;
}
export async function requireProjectRole(input: Input, minimum: ProjectRole, db: Pick<ReturnType<typeof getDb>, "select"> = getDb()) {
  const membership = await getProjectMembership(input, db);
  if (!membership) throw new AccessError("RESOURCE_NOT_FOUND");
  if (!hasProjectRole(membership.role, minimum)) throw new AccessError("FORBIDDEN");
  return membership;
}
export const requireProjectViewer = (input: Input, db: Pick<ReturnType<typeof getDb>, "select"> = getDb()) => requireProjectRole(input, PROJECT_ROLES.VIEWER, db);
export const requireProjectMember = (input: Input, db: Pick<ReturnType<typeof getDb>, "select"> = getDb()) => requireProjectRole(input, PROJECT_ROLES.MEMBER, db);
export const requireProjectOwner = (input: Input, db: Pick<ReturnType<typeof getDb>, "select"> = getDb()) => requireProjectRole(input, PROJECT_ROLES.OWNER, db);
