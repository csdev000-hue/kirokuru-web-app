import { expect, it } from "vitest";
import { hasProjectRole, ORGANIZATION_ROLES, PROJECT_ROLES, PROJECT_PERMISSIONS, ORGANIZATION_PERMISSIONS, type ProjectRole } from "@/lib/permissions/roles";
import { projectMembers, organizationMembers } from "@/lib/db/schema";
it("Role定数とDB Schemaの列挙値が一致", () => {
  expect(Object.values(PROJECT_ROLES).sort()).toEqual([...projectMembers.role.enumValues!].sort());
  expect(Object.values(ORGANIZATION_ROLES).sort()).toEqual([...organizationMembers.role.enumValues!].sort());
});
it.each([
  ["owner", "owner", true], ["owner", "member", true], ["owner", "viewer", true],
  ["member", "owner", false], ["member", "member", true], ["member", "viewer", true],
  ["viewer", "owner", false], ["viewer", "member", false], ["viewer", "viewer", true],
] satisfies [ProjectRole, ProjectRole, boolean][])("Role %s >= %s → %s", (actual, minimum, expected) => {
  expect(hasProjectRole(actual, minimum)).toBe(expected);
});
it("Project Permission Matrix: owner管理/member更新/viewer閲覧", () => {
  expect(PROJECT_PERMISSIONS).toEqual({ read: "viewer", ticketCreate: "member", ticketUpdate: "member", meetingCreate: "member", aiGenerate: "member", settingsUpdate: "owner", memberManage: "owner" });
  expect(ORGANIZATION_PERMISSIONS).toEqual({ read: ["owner", "member"], update: ["owner"], memberManage: ["owner"], delete: ["owner"] });
});
