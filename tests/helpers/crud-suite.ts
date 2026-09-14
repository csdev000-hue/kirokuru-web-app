import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createTestDatabase, type TestDatabase } from "./postgres";
import { seedTestDatabase, type DatabaseFixture } from "../fixtures/db";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { AccessError } from "@/lib/permissions/errors";
import * as orgs from "@/app/api/organizations/route";
import * as org from "@/app/api/organizations/[id]/route";
import * as orgMembers from "@/app/api/organizations/[id]/members/route";
import * as projects from "@/app/api/projects/route";
import * as project from "@/app/api/projects/[id]/route";
import * as projectMembers from "@/app/api/projects/[id]/members/route";
import * as s from "@/lib/db/schema";
import { createOrganization, deleteOrganization } from "@/lib/services/organization-service";
import { createProject } from "@/lib/services/project-service";

export function crudSuite(security = false) {
  let context: TestDatabase; let fixture: DatabaseFixture;
  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const request = (method = "GET", body?: unknown, origin = "http://localhost:3100") => new Request("http://localhost:3100/api/projects", { method, headers: { origin, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const login = (user: typeof fixture.ownerA) => vi.mocked(requireCurrentUser).mockResolvedValue(user);
  beforeAll(async () => { context = await createTestDatabase(); await migrate(context.db, { migrationsFolder: "drizzle/migrations" }); fixture = await seedTestDatabase(context); }, 120_000);
  beforeEach(() => { vi.mocked(getDb).mockReturnValue(context.db); login(fixture.ownerA); vi.stubEnv("AUTH_URL", "http://localhost:3100"); vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterAll(async () => { if (context) await context.close(); }, 30_000);
  it("ORG-T02 未認証は401", async () => { vi.mocked(requireCurrentUser).mockRejectedValue(new AccessError("UNAUTHENTICATED")); expect((await orgs.GET()).status).toBe(401); });
  it("ORG-T03 / TENANT-T01 / SEC-ORG-01 別組織の全操作を拒否", async () => {
    for (const response of [await org.GET(request(), params(fixture.organizationB.id)), await org.PATCH(request("PATCH", { name: "Attack" }), params(fixture.organizationB.id)), await org.DELETE(request("DELETE"), params(fixture.organizationB.id)), await orgMembers.GET(request(), params(fixture.organizationB.id))]) expect(response.status).toBe(404);
  });
  it("PRJ-T02 / TENANT-T02 / SEC-PRJ-01 別Project全操作と作成を拒否", async () => {
    for (const response of [await project.GET(request(), params(fixture.projectB.id)), await project.PATCH(request("PATCH", { name: "Attack" }), params(fixture.projectB.id)), await project.DELETE(request("DELETE"), params(fixture.projectB.id)), await projectMembers.GET(request(), params(fixture.projectB.id)), await projects.POST(request("POST", { organizationId: fixture.organizationB.id, name: "Attack" }))]) expect(response.status).toBe(404);
  });
  it("TENANT-T03/04 一覧を所属で絞り込む", async () => {
    expect((await (await orgs.GET()).json()).data.map((row: {id: string}) => row.id)).not.toContain(fixture.organizationB.id);
    expect((await (await projects.GET(request())).json()).data.map((row: {id: string}) => row.id)).not.toContain(fixture.projectB.id);
    expect((await projects.GET(new Request(`http://localhost:3100/api/projects?organizationId=${fixture.organizationB.id}`))).status).toBe(404);
  });
  it("ORG-T04 memberは更新・削除不可", async () => { login(fixture.memberA); expect((await org.PATCH(request("PATCH", { name: "Attack" }), params(fixture.organizationA.id))).status).toBe(403); expect((await org.DELETE(request("DELETE"), params(fixture.organizationA.id))).status).toBe(403); });
  it.each(["memberA", "viewerA"] as const)("PRJ-T03/04 SEC-ROLE-01/02 %sは設定更新・archive不可", async (key) => { login(fixture[key]); expect((await project.PATCH(request("PATCH", { name: "Attack" }), params(fixture.projectA.id))).status).toBe(403); expect((await project.DELETE(request("DELETE"), params(fixture.projectA.id))).status).toBe(403); });
  it.each(["createdBy", "created_by", "role", "id", "organization_id", "organizationId", "createdAt"])("SEC-MASS-01/02 更新に%sを注入すると400", async (key) => {
    expect((await project.PATCH(request("PATCH", { name: "Attack", [key]: fixture.organizationB.id }), params(fixture.projectA.id))).status).toBe(400);
    expect((await org.PATCH(request("PATCH", { name: "Attack", [key]: fixture.organizationB.id }), params(fixture.organizationA.id))).status).toBe(400);
  });
  it("作成でもcreatedBy/role/statusの注入を拒否", async () => {
    expect((await orgs.POST(request("POST", { name: "Attack", createdBy: fixture.ownerB.id, role: "owner" }))).status).toBe(400);
    expect((await projects.POST(request("POST", { organizationId: fixture.organizationA.id, name: "Attack", status: "archived" }))).status).toBe(400);
  });
  it("Origin欠落・異なるOriginのCookie書込を拒否", async () => {
    expect((await orgs.POST(request("POST", { name: "Attack" }, "https://evil.invalid"))).status).toBe(403);
    expect((await org.DELETE(request("DELETE", undefined, ""), params(fixture.organizationA.id))).status).toBe(403);
  });
  it("PRJ-T06/07 不正statusと空PATCHを拒否", async () => { for (const body of [{ status: "deleted" }, {}]) expect((await project.PATCH(request("PATCH", body), params(fixture.projectA.id))).status).toBe(400); });
  it("不正UUIDは内部エラーにせず404", async () => { expect((await org.GET(request(), params("bad"))).status).toBe(404); expect((await project.GET(request(), params("bad"))).status).toBe(404); });
  it("1MB超過を413、不正JSONを400", async () => {
    expect((await orgs.POST(request("POST", { name: "a".repeat(1_048_576) }))).status).toBe(413);
    expect((await orgs.POST(new Request("http://localhost:3100", { method: "POST", headers: { origin: "http://localhost:3100", "Content-Type": "application/json" }, body: "{" }))).status).toBe(400);
  });
  if (security) return;
  it("ORG-T01/05 Organization作成owner・更新・audit・論理削除", async () => {
    const created = await orgs.POST(request("POST", { name: "  New organization  " })); expect(created.status).toBe(201);
    const { data } = await created.json(); expect(data).toMatchObject({ name: "New organization", role: "owner" }); expect(data.createdBy).toBeUndefined();
    const [dbOrg] = await context.db.select().from(s.organizations).where(eq(s.organizations.id, data.id)); expect(dbOrg.createdBy).toBe(fixture.ownerA.id);
    const members = await (await orgMembers.GET(request(), params(data.id))).json(); expect(members.data).toEqual([{ userId: fixture.ownerA.id, name: fixture.ownerA.name, email: fixture.ownerA.email, role: "owner" }]);
    expect((await org.PATCH(request("PATCH", { name: "Updated" }), params(data.id))).status).toBe(200);
    expect((await org.DELETE(request("DELETE"), params(data.id))).status).toBe(204);
    expect((await org.GET(request(), params(data.id))).status).toBe(404);
    expect((await orgMembers.GET(request(), params(data.id))).status).toBe(404);
    expect((await projects.POST(request("POST", { organizationId: data.id, name: "Deleted org" }))).status).toBe(404);
    expect((await (await orgs.GET()).json()).data.map((row: {id: string}) => row.id)).not.toContain(data.id);
    const audit = await context.db.select().from(s.auditLogs).where(eq(s.auditLogs.organizationId, data.id)).orderBy(s.auditLogs.createdAt); expect(audit.map((row) => row.action)).toEqual(["organization.create", "organization.update", "organization.delete"]); expect(audit.every((row) => !JSON.stringify(row.metadata).includes("Updated"))).toBe(true);
  });
  it("ORG-T06 Projectがある組織の削除409", async () => { const response = await org.DELETE(request("DELETE"), params(fixture.organizationA.id)); expect(response.status).toBe(409); expect((await response.json()).error.code).toBe("ORGANIZATION_NOT_EMPTY"); });
  it("PRJ-T01/05 組織memberが作成者ownerになり更新・archive・再開", async () => {
    login(fixture.memberA);
    const response = await projects.POST(request("POST", { name: "New project", organizationId: fixture.organizationA.id, description: null })); expect(response.status).toBe(201); const { data } = await response.json(); expect(data).toMatchObject({ role: "owner", status: "active", description: null });
    expect((await project.PATCH(request("PATCH", { name: "Updated project", description: "Changed" }), params(data.id))).status).toBe(200);
    expect((await (await projectMembers.GET(request(), params(data.id))).json()).data).toHaveLength(1);
    expect((await project.DELETE(request("DELETE"), params(data.id))).status).toBe(204);
    expect((await (await project.GET(request(), params(data.id))).json()).data.status).toBe("archived");
    expect((await project.PATCH(request("PATCH", { status: "active" }), params(data.id))).status).toBe(200);
    const audit = await context.db.select().from(s.auditLogs).where(eq(s.auditLogs.resourceId, data.id)).orderBy(s.auditLogs.createdAt); expect(audit.map((row) => row.action)).toEqual(["project.create", "project.update", "project.archive", "project.update"]);
    login(fixture.ownerA); expect((await project.GET(request(), params(data.id))).status).toBe(404); // org owner is not an implicit project member
  });
  it("viewerの詳細・Member参照とレスポンス安全性", async () => { login(fixture.viewerA); const response = await project.GET(request(), params(fixture.projectA.id)); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store"); expect(Object.keys((await response.json()).data).sort()).toEqual(["id", "organizationId", "name", "description", "status", "role", "createdAt", "updatedAt"].sort()); expect((await projectMembers.GET(request(), params(fixture.projectA.id))).status).toBe(200); });
  it("関連Ticket/MeetingがあるProjectもarchiveで保持", async () => {
    expect((await project.DELETE(request("DELETE"), params(fixture.projectA.id))).status).toBe(204);
    expect(await context.db.select().from(s.tickets).where(eq(s.tickets.id, fixture.ticket.id))).toHaveLength(1);
    expect(await context.db.select().from(s.meetings).where(eq(s.meetings.id, fixture.meetingA.id))).toHaveLength(1);
    expect((await org.DELETE(request("DELETE"), params(fixture.organizationA.id))).status).toBe(409);
  });
  it("監査INSERT失敗はOrganization/Projectとownerを全rollback", async () => {
    const orgBefore = await context.db.select().from(s.organizations); const projectBefore = await context.db.select().from(s.projects); const membersBefore = await context.db.select().from(s.projectMembers); const orgMembersBefore = await context.db.select().from(s.organizationMembers);
    await context.db.execute(sql`CREATE FUNCTION reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test-only failure'; END $$`);
    await context.db.execute(sql`CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_audit()`);
    try {
      const response = await orgs.POST(request("POST", { name: "Rollback org" })); expect(response.status).toBe(500); expect(JSON.stringify(await response.json())).not.toContain("test-only");
      expect((await projects.POST(request("POST", { organizationId: fixture.organizationA.id, name: "Rollback project" }))).status).toBe(500);
      expect(await context.db.select().from(s.organizations)).toHaveLength(orgBefore.length); expect(await context.db.select().from(s.projects)).toHaveLength(projectBefore.length); expect(await context.db.select().from(s.projectMembers)).toHaveLength(membersBefore.length); expect(await context.db.select().from(s.organizationMembers)).toHaveLength(orgMembersBefore.length);
    } finally { await context.db.execute(sql`DROP TRIGGER reject_audit ON audit_logs`); await context.db.execute(sql`DROP FUNCTION reject_audit()`); }
  });
  it("削除済み組織をPermissionでも拒否", async () => {
    const created = await createOrganization(fixture.ownerA.id, { name: "Deleted" }, context.db);
    await deleteOrganization(fixture.ownerA.id, created.id, context.db);
    await expect(createProject(fixture.ownerA.id, { organizationId: created.id, name: "Not allowed" }, context.db)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });
}
