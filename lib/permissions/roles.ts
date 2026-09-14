import type { OrganizationMember, ProjectMember } from "@/lib/db/schema";
export type OrganizationRole = OrganizationMember["role"];
export type ProjectRole = ProjectMember["role"];
export const ORGANIZATION_ROLES = { OWNER: "owner", MEMBER: "member" } as const satisfies Record<string, OrganizationRole>;
export const PROJECT_ROLES = { OWNER: "owner", MEMBER: "member", VIEWER: "viewer" } as const satisfies Record<string, ProjectRole>;
const projectLevel: Record<ProjectRole, number> = { owner: 3, member: 2, viewer: 1 };
export function hasProjectRole(actual: ProjectRole, minimum: ProjectRole) {
  return Object.hasOwn(projectLevel, actual) && Object.hasOwn(projectLevel, minimum) && projectLevel[actual] >= projectLevel[minimum];
}
export const PROJECT_PERMISSIONS = {
  read: PROJECT_ROLES.VIEWER,
  ticketCreate: PROJECT_ROLES.MEMBER,
  ticketUpdate: PROJECT_ROLES.MEMBER,
  meetingCreate: PROJECT_ROLES.MEMBER,
  aiGenerate: PROJECT_ROLES.MEMBER,
  settingsUpdate: PROJECT_ROLES.OWNER,
  memberManage: PROJECT_ROLES.OWNER,
} as const;
export const ORGANIZATION_PERMISSIONS = {
  read: [ORGANIZATION_ROLES.OWNER, ORGANIZATION_ROLES.MEMBER],
  update: [ORGANIZATION_ROLES.OWNER],
  memberManage: [ORGANIZATION_ROLES.OWNER],
  delete: [ORGANIZATION_ROLES.OWNER],
} as const;
