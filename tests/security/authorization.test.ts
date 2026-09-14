import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as s from "@/lib/db/schema";
import { requireOrganizationOwner, requireOrganizationMember } from "@/lib/permissions/organization";
import { requireProjectOwner, requireProjectMember, requireProjectViewer } from "@/lib/permissions/project";
import { requireTicketAccess, requireMeetingAccess, requireMinutesAccess, requireTicketCandidateAccess } from "@/lib/permissions/resource";
import { writeAuditLog } from "@/lib/security/audit";
import { createTestDatabase, type TestDatabase } from "../helpers/postgres";
import { seedTestDatabase, type DatabaseFixture } from "../fixtures/db";

let context: TestDatabase;
let f: DatabaseFixture;
let foreign: { ticketId: string; minutesId: string; candidateId: string };
beforeAll(async () => {
  context = await createTestDatabase();
  await migrate(context.db, { migrationsFolder: "drizzle/migrations" });
  f = await seedTestDatabase(context);
  const [ticket] = await context.db.insert(s.tickets).values({ title: "B secret ticket", projectId: f.projectB.id, createdBy: f.ownerB.id }).returning();
  const [minutes] = await context.db.insert(s.meetingMinutes).values({ meetingId: f.meetingB.id, createdBy: f.ownerB.id, summary: "B secret summary" }).returning();
  const [candidate] = await context.db.insert(s.ticketCandidates).values({ title: "B secret candidate", projectId: f.projectB.id, meetingId: f.meetingB.id, minutesId: minutes.id }).returning();
  foreign = { ticketId: ticket.id, minutesId: minutes.id, candidateId: candidate.id };
}, 120_000);
afterAll(async () => { if (context) await context.close(); }, 30_000);
beforeEach(async () => { await context.db.execute(sql`BEGIN`); });
afterEach(async () => { await context.db.execute(sql`ROLLBACK`); });

it("AUTHZ-T01: Organization owner", async () => {
  expect((await requireOrganizationOwner({ userId: f.ownerA.id, organizationId: f.organizationA.id }, context.db)).role).toBe("owner");
});
it("AUTHZ-T02: Organization memberの管理操作は403", async () => {
  await expect(requireOrganizationOwner({ userId: f.memberA.id, organizationId: f.organizationA.id }, context.db)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
});
it("AUTHZ-T03: Project owner", async () => {
  expect((await requireProjectOwner({ userId: f.ownerA.id, projectId: f.projectA.id }, context.db)).role).toBe("owner");
});
it("AUTHZ-T04: Project member", async () => {
  expect((await requireProjectMember({ userId: f.memberA.id, projectId: f.projectA.id }, context.db)).role).toBe("member");
});
it("AUTHZ-T05: Viewerは更新不可", async () => {
  await expect(requireProjectMember({ userId: f.viewerA.id, projectId: f.projectA.id }, context.db)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("AUTHZ-T06: Viewerは閲覧可能", async () => {
  expect((await requireProjectViewer({ userId: f.viewerA.id, projectId: f.projectA.id }, context.db)).role).toBe("viewer");
});
it("AUTHZ-T07: Organization ownerでもProject非所属なら404", async () => {
  await context.db.delete(s.projectMembers).where(and(eq(s.projectMembers.userId, f.ownerA.id), eq(s.projectMembers.projectId, f.projectA.id)));
  await expect(requireProjectViewer({ userId: f.ownerA.id, projectId: f.projectA.id }, context.db)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
});
it("AUTHZ-T08/SEC-TENANT-01: 別OrganizationのProjectは404", async () => {
  await expect(requireProjectViewer({ userId: f.ownerA.id, projectId: f.projectB.id }, context.db)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND", status: 404, message: "対象が見つかりません。" });
});
it("別Organizationと未知Organizationの応答を統一", async () => {
  for (const organizationId of [f.organizationB.id, randomUUID(), "invalid"]) {
    await expect(requireOrganizationMember({ userId: f.ownerA.id, organizationId }, context.db)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND", message: "対象が見つかりません。" });
  }
});
it("Project所属だけを偽装してもOrganization非所属なら404", async () => {
  await context.db.insert(s.projectMembers).values({ projectId: f.projectB.id, userId: f.ownerA.id, role: "owner" });
  await expect(requireProjectOwner({ userId: f.ownerA.id, projectId: f.projectB.id }, context.db)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
});
it("組織から除外されたProjectメンバーを拒否", async () => {
  await context.db.delete(s.organizationMembers).where(and(eq(s.organizationMembers.organizationId, f.organizationA.id), eq(s.organizationMembers.userId, f.memberA.id)));
  await expect(requireProjectViewer({ userId: f.memberA.id, projectId: f.projectA.id }, context.db)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
});
it("Session/Clientのrole=ownerを無視してDB roleを使う", async () => {
  const forged = { userId: f.viewerA.id, projectId: f.projectA.id, role: "owner", organizationId: f.organizationB.id, created_by: f.ownerA.id };
  await expect(requireProjectOwner(forged, context.db)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await requireProjectViewer(forged, context.db)).role).toBe("viewer");
});
it("DBでのrole降格は次回判定に反映", async () => {
  await requireProjectOwner({ userId: f.ownerA.id, projectId: f.projectA.id }, context.db);
  await context.db.update(s.projectMembers).set({ role: "viewer" }).where(and(eq(s.projectMembers.projectId, f.projectA.id), eq(s.projectMembers.userId, f.ownerA.id)));
  await expect(requireProjectMember({ userId: f.ownerA.id, projectId: f.projectA.id }, context.db)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("SEC-TENANT-02: TicketのClient projectIdを信用しない", async () => {
  const input = { userId: f.ownerA.id, ticketId: foreign.ticketId, projectId: f.projectA.id, role: "owner" };
  await expect(requireTicketAccess(input, context.db)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
});
it("SEC-TENANT-03: 別OrganizationのMeetingを拒否", async () => {
  await expect(requireMeetingAccess({ userId: f.ownerA.id, meetingId: f.meetingB.id }, context.db)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
});
it("別OrganizationのMinutes/Candidateを拒否", async () => {
  await expect(requireMinutesAccess({ userId: f.ownerA.id, minutesId: foreign.minutesId }, context.db)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  await expect(requireTicketCandidateAccess({ userId: f.ownerA.id, candidateId: foreign.candidateId }, context.db)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
});
it("Minutes/Candidateを同一Project viewerが参照できる", async () => {
  expect((await requireMinutesAccess({ userId: f.viewerA.id, minutesId: f.minutes.id }, context.db)).projectId).toBe(f.projectA.id);
  expect((await requireTicketCandidateAccess({ userId: f.viewerA.id, candidateId: f.candidate.id }, context.db)).projectId).toBe(f.projectA.id);
});
it.each(["ticket", "meeting", "minutes", "candidate"])("%sの変更要求はviewerを拒否", async (kind) => {
  const input = { userId: f.viewerA.id, minimumRole: "member" as const };
  const query = kind === "ticket" ? requireTicketAccess({ ...input, ticketId: f.ticket.id }, context.db)
    : kind === "meeting" ? requireMeetingAccess({ ...input, meetingId: f.meetingA.id }, context.db)
    : kind === "minutes" ? requireMinutesAccess({ ...input, minutesId: f.minutes.id }, context.db)
    : requireTicketCandidateAccess({ ...input, candidateId: f.candidate.id }, context.db);
  await expect(query).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("不整合な候補Project/Meetingを拒否", async () => {
  await context.db.update(s.ticketCandidates).set({ projectId: f.projectA.id }).where(eq(s.ticketCandidates.id, foreign.candidateId));
  await expect(requireTicketCandidateAccess({ userId: f.ownerA.id, candidateId: foreign.candidateId }, context.db)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
});
it("候補が別MeetingのMinutesを参照する場合も拒否", async () => {
  await context.db.update(s.ticketCandidates).set({ minutesId: foreign.minutesId }).where(eq(s.ticketCandidates.id, f.candidate.id));
  await expect(requireTicketCandidateAccess({ userId: f.ownerA.id, candidateId: f.candidate.id }, context.db)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
});
it("論理削除Ticketを参照できない", async () => {
  await context.db.update(s.tickets).set({ deletedAt: new Date() }).where(eq(s.tickets.id, f.ticket.id));
  await expect(requireTicketAccess({ userId: f.ownerA.id, ticketId: f.ticket.id }, context.db)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
});
it("未知/不正Resource IDは内容を漏らさず404", async () => {
  for (const id of [randomUUID(), "' OR 1=1 --"]) {
    await expect(requireTicketAccess({ userId: f.ownerA.id, ticketId: id }, context.db)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    await expect(requireMeetingAccess({ userId: f.ownerA.id, meetingId: id }, context.db)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    await expect(requireMinutesAccess({ userId: f.ownerA.id, minutesId: id }, context.db)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    await expect(requireTicketCandidateAccess({ userId: f.ownerA.id, candidateId: id }, context.db)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  }
});
it("監査は認可済みのサーバー入力を記録する", async () => {
  const record = await writeAuditLog({ organizationId: f.organizationA.id, userId: f.ownerA.id, action: "project.update", resourceType: "project", resourceId: f.projectA.id, metadata: { changedFields: ["name"] } }, context.db);
  const [row] = await context.db.select().from(s.auditLogs).where(eq(s.auditLogs.id, record.id));
  expect(row.metadata).toEqual({ changedFields: ["name"] });
});
it("監査metadataにSecretや自由本文を保存しない", async () => {
  const input = { organizationId: f.organizationA.id, userId: f.ownerA.id, action: "project.update" as const, resourceType: "project" as const, resourceId: f.projectA.id, metadata: { count: 1, accessToken: "unit-test-sensitive-value" } };
  await expect(writeAuditLog(input, context.db)).rejects.toThrow(/^Invalid audit event$/);
});
