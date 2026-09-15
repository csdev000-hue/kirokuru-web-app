import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDb } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { AccessError } from "@/lib/permissions/errors";
import { createTestDatabase, type TestDatabase } from "./postgres";
import { seedTestDatabase, type DatabaseFixture } from "../fixtures/db";
import * as collection from "@/app/api/projects/[id]/tickets/route";
import * as detail from "@/app/api/tickets/[id]/route";
import * as comments from "@/app/api/tickets/[id]/comments/route";
import * as s from "@/lib/db/schema";
export function ticketSuite(security = false) {
 let db: TestDatabase; let f: DatabaseFixture;
 const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
 const req = (method = "GET", body?: unknown, query = "") => new Request(`http://localhost:3100/api/tickets${query}`, { method, headers: { origin: "http://localhost:3100", "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
 const login = (key: "ownerA" | "memberA" | "viewerA" | "ownerB") => vi.mocked(requireCurrentUser).mockResolvedValue(f[key]);
 beforeAll(async () => { db = await createTestDatabase(); await migrate(db.db, { migrationsFolder: "drizzle/migrations" }); f = await seedTestDatabase(db); }, 120000);
 beforeEach(() => { vi.mocked(getDb).mockReturnValue(db.db); login("ownerA"); vi.stubEnv("AUTH_URL", "http://localhost:3100"); vi.spyOn(console, "warn").mockImplementation(() => {}); });
 afterAll(async () => { if (db) await db.close(); }, 30000);
 it("未認証401", async () => { vi.mocked(requireCurrentUser).mockRejectedValue(new AccessError("UNAUTHENTICATED")); expect((await collection.GET(req(), ctx(f.projectA.id))).status).toBe(401); });
 it("TKT-T04 SEC-TKT-01 CMT-T03 越境全操作拒否", async () => {
  login("ownerB");
  for (const response of [await collection.GET(req(), ctx(f.projectA.id)), await collection.POST(req("POST", { title: "x", type: "task" }), ctx(f.projectA.id)), await detail.GET(req(), ctx(f.ticket.id)), await detail.PATCH(req("PATCH", { status: "done" }), ctx(f.ticket.id)), await detail.DELETE(req("DELETE"), ctx(f.ticket.id)), await comments.GET(req(), ctx(f.ticket.id)), await comments.POST(req("POST", { content: "attack" }), ctx(f.ticket.id))]) expect(response.status).toBe(404);
 });
 it("TKT-T03/06 CMT-T02 KBN-T03 SEC-TKT-06 viewer write拒否", async () => {
  login("viewerA"); expect((await detail.GET(req(), ctx(f.ticket.id))).status).toBe(200);
  for (const response of [await collection.POST(req("POST", { title: "x", type: "task" }), ctx(f.projectA.id)), await detail.PATCH(req("PATCH", { status: "done" }), ctx(f.ticket.id)), await detail.DELETE(req("DELETE"), ctx(f.ticket.id)), await comments.POST(req("POST", { content: "attack" }), ctx(f.ticket.id))]) expect(response.status).toBe(403);
 });
 it.each(["projectId", "project_id", "createdBy", "created_by", "sourceMeetingId", "source_meeting_id", "sourceCandidateId", "source_candidate_id", "deletedAt", "updatedAt", "role"])("SEC-TKT-02/03/04 %sの注入を拒否", async (field) => {
  expect((await detail.PATCH(req("PATCH", { [field]: f.projectB.id }), ctx(f.ticket.id))).status).toBe(400);
  expect((await collection.POST(req("POST", { title: "Attack", type: "task", [field]: f.projectB.id }), ctx(f.projectA.id))).status).toBe(400);
 });
 it("TKT-T10 SEC-TKT-05 別tenant担当者拒否", async () => {
  expect((await detail.PATCH(req("PATCH", { assigneeId: f.ownerB.id }), ctx(f.ticket.id))).status).toBe(422);
  expect((await collection.POST(req("POST", { title: "x", type: "task", assigneeId: f.ownerB.id }), ctx(f.projectA.id))).status).toBe(422);
 });
 it.each([{ status: "unknown" }, { priority: "critical" }, { type: "unknown" }, { dueDate: "2026-02-30" }, {}])("TKT-T08/09 不正値拒否 %#", async (body) => { expect((await detail.PATCH(req("PATCH", body), ctx(f.ticket.id))).status).toBe(400); });
 it("CMT-T04 空コメント422・userId注入不可", async () => { for (const body of [{ content: "   " }, { content: "x", userId: f.ownerB.id }]) expect((await comments.POST(req("POST", body), ctx(f.ticket.id))).status).toBe(422); });
 if (security) return;
 it.each(["ownerA", "memberA"] as const)("TKT-T01/02 %s作成・サーバー所有者指定", async (key) => {
  login(key); const response = await collection.POST(req("POST", { title: "  New  ", type: "issue", priority: "high", assigneeId: f.memberA.id, dueDate: "2026-09-15" }), ctx(f.projectA.id)); expect(response.status).toBe(201);
  expect((await response.json()).data).toMatchObject({ title: "New", status: "todo", createdBy: { id: f[key].id }, assignee: { id: f.memberA.id }, sourceMeetingId: null, sourceCandidateId: null });
 });
 it("TKT-T05 KBN-T01/02 member更新とstatus遷移", async () => { login("memberA"); for (const status of ["in_progress", "done", "blocked", "todo"]) { const response = await detail.PATCH(req("PATCH", { status }), ctx(f.ticket.id)); expect(response.status).toBe(200); expect((await response.json()).data.status).toBe(status); } });
 it("CMT-T01 投稿者・時系列・XSSはデータとして保持", async () => {
  login("memberA"); const content = "<script>window.pwned=true</script>"; expect((await comments.POST(req("POST", { content }), ctx(f.ticket.id))).status).toBe(201);
  const rows = (await (await comments.GET(req(), ctx(f.ticket.id))).json()).data; expect(rows.at(-1)).toMatchObject({ content, author: { id: f.memberA.id } });
 });
 it("FILTER-T01〜06・sort・page・total・別Project除外", async () => {
  const input = { title: "Unique%search", description: "body keyword", type: "followup", priority: "urgent", assigneeId: f.viewerA.id, dueDate: "2026-10-01" };
  const created = (await (await collection.POST(req("POST", input), ctx(f.projectA.id))).json()).data;
  for (const filter of ["status=todo", "priority=urgent", "type=followup", `assigneeId=${f.viewerA.id}`, "q=body", "q=%25", `status=todo&priority=urgent&type=followup&assigneeId=${f.viewerA.id}&q=Unique`]) {
   const result = await (await collection.GET(req("GET", undefined, `?${filter}`), ctx(f.projectA.id))).json(); expect(result.data.map((row: {id: string}) => row.id)).toContain(created.id); expect(result.data.every((row: {projectId: string}) => row.projectId === f.projectA.id)).toBe(true);
  }
  for (const sort of ["priority", "dueDate", "createdAt", "updatedAt"]) for (const order of ["asc", "desc"]) expect((await collection.GET(req("GET", undefined, `?sort=${sort}&order=${order}`), ctx(f.projectA.id))).status).toBe(200);
  const first = await (await collection.GET(req("GET", undefined, "?limit=1&page=1"), ctx(f.projectA.id))).json(); const second = await (await collection.GET(req("GET", undefined, "?limit=1&page=2"), ctx(f.projectA.id))).json(); expect(first.data).toHaveLength(1); expect(first.meta.total).toBeGreaterThan(1); expect(second.data[0].id).not.toBe(first.data[0].id);
  for (const query of ["limit=101", "limit=-1", "page=0", "sort=title;drop table", "order=no"]) expect((await collection.GET(req("GET", undefined, `?${query}`), ctx(f.projectA.id))).status).toBe(400);
 });
 it("TKT-T07 論理削除・コメント保持・全通常操作404", async () => {
  const created = (await (await collection.POST(req("POST", { title: "Delete", type: "task" }), ctx(f.projectA.id))).json()).data;
  await comments.POST(req("POST", { content: "preserved" }), ctx(created.id)); expect((await detail.DELETE(req("DELETE"), ctx(created.id))).status).toBe(204);
  const [row] = await db.db.select().from(s.tickets).where(eq(s.tickets.id, created.id)); expect(row.deletedAt).not.toBeNull(); expect(await db.db.select().from(s.ticketComments).where(eq(s.ticketComments.ticketId, created.id))).toHaveLength(1);
  for (const response of [await detail.GET(req(), ctx(created.id)), await detail.PATCH(req("PATCH", { status: "done" }), ctx(created.id)), await comments.GET(req(), ctx(created.id)), await comments.POST(req("POST", { content: "no" }), ctx(created.id))]) expect(response.status).toBe(404);
  const result = await (await collection.GET(req(), ctx(f.projectA.id))).json(); expect(result.data.map((t: {id: string}) => t.id)).not.toContain(created.id);
 });
 it("Audit失敗時Ticket作成rollback・情報漏えいなし", async () => {
  const before = await db.db.select().from(s.tickets);
  await db.db.execute(sql`CREATE FUNCTION reject_ticket_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private-db-detail'; END $$`);
  await db.db.execute(sql`CREATE TRIGGER reject_ticket_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_ticket_audit()`);
  try { const response = await collection.POST(req("POST", { title: "Rollback", type: "task" }), ctx(f.projectA.id)); expect(response.status).toBe(500); expect(JSON.stringify(await response.json())).not.toContain("private-db-detail"); expect(await db.db.select().from(s.tickets)).toHaveLength(before.length); }
  finally { await db.db.execute(sql`DROP TRIGGER reject_ticket_audit ON audit_logs`); await db.db.execute(sql`DROP FUNCTION reject_ticket_audit()`); }
 });
 it("archiveで書込拒否・閲覧可能・監査本文なし", async () => {
  await db.db.update(s.projects).set({ status: "archived" }).where(eq(s.projects.id, f.projectA.id));
  for (const response of [await collection.POST(req("POST", { title: "x", type: "task" }), ctx(f.projectA.id)), await detail.PATCH(req("PATCH", { title: "x" }), ctx(f.ticket.id)), await detail.DELETE(req("DELETE"), ctx(f.ticket.id)), await comments.POST(req("POST", { content: "x" }), ctx(f.ticket.id))]) expect(response.status).toBe(409);
  expect((await detail.GET(req(), ctx(f.ticket.id))).status).toBe(200);
  const logs = await db.db.select().from(s.auditLogs); expect(logs.some((row) => row.action === "ticket.comment.create")).toBe(true); expect(logs.some((row) => row.action === "ticket.delete")).toBe(true); expect(logs.filter((row) => row.action.startsWith("ticket.")).every((row) => row.metadata?.projectId === f.projectA.id && !JSON.stringify(row.metadata).includes("script"))).toBe(true);
 });
}
