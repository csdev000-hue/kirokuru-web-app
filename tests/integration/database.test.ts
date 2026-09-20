import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { eq, getTableName, is, isNotNull, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as s from "../../lib/db/schema";
import { createTestDatabase, type TestDatabase } from "../helpers/postgres";
import { seedTestDatabase, type DatabaseFixture } from "../fixtures/db";

async function rejectsDb(query: PromiseLike<unknown>, code: string, constraint?: string) {
  await expect(Promise.resolve(query).catch((error: unknown) => {
    throw error instanceof Error && error.cause ? error.cause : error;
  })).rejects.toMatchObject({ code, ...(constraint ? { constraint_name: constraint } : {}) });
}

const tables = Object.values(s).filter((value) => is(value, PgTable));
const foreignKeys = tables.flatMap((table) => getTableConfig(table).foreignKeys.map((fk) => ({
  table: getTableName(table), column: fk.reference().columns[0].name, name: fk.getName(),
})));

let context: TestDatabase;
let fixture: DatabaseFixture;
beforeAll(async () => {
  context = await createTestDatabase();
  await migrate(context.db, { migrationsFolder: "drizzle/migrations" });
  fixture = await seedTestDatabase(context);
  await migrate(context.db, { migrationsFolder: "drizzle/migrations" });
}, 120_000);
afterAll(async () => { if (context) await context.close(); }, 30_000);
beforeEach(async () => { await context.db.execute(sql`BEGIN`); });
afterEach(async () => { await context.db.execute(sql`ROLLBACK`); });

it("生成Migrationは16テーブルを作成し再適用してもデータを壊さない", async () => {
  const tableRows = await context.db.execute<{ table_name: string }>(sql`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  expect(tableRows.map((row) => row.table_name).sort()).toEqual(tables.map(getTableName).sort());
  expect(await context.db.select().from(s.users)).toHaveLength(4);
});

it("DB-T01: organization roleの不正値を拒否", async () => {
  await rejectsDb(context.db.execute(sql`UPDATE organization_members SET role = 'viewer'`), "23514", "organization_members_role_check");
});
it("DB-T02: project roleの不正値を拒否", async () => {
  await rejectsDb(context.db.execute(sql`UPDATE project_members SET role = 'admin'`), "23514", "project_members_role_check");
});
it("DB-T03: meeting statusの不正値を拒否", async () => {
  await rejectsDb(context.db.execute(sql`UPDATE meetings SET status = 'invalid'`), "23514", "meetings_status_check");
});
it("DB-T04: 同一meetingのsequence_no重複を拒否", async () => {
  await rejectsDb(context.db.insert(s.meetingTranscripts).values({
    meetingId: fixture.meetingA.id, speakerName: "Guest", startedAt: "0", text: "duplicate", sequenceNo: 1,
  }), "23505", "uq_transcript_sequence");
});
it("DB-T05: 同一meetingのversion重複を拒否", async () => {
  await rejectsDb(context.db.insert(s.meetingMinutes).values({ meetingId: fixture.meetingA.id, version: 1, createdBy: fixture.ownerA.id }), "23505", "uq_minutes_version");
});
it.each(["1.0001", "-0.0001"])("DB-T06/07: confidence=%sを拒否", async (confidence) => {
  await rejectsDb(context.db.update(s.ticketCandidates).set({ confidence }), "23514", "ticket_candidates_confidence_check");
});
it.each(["status", "type", "priority"])("DB-T08: ticket %sの不正値を拒否", async (column) => {
  await rejectsDb(context.db.execute(sql`UPDATE tickets SET ${sql.identifier(column)} = 'invalid'`), "23514", `tickets_${column}_check`);
});
it.each(foreignKeys)("DB-T09: $table.$column の存在しない参照先を拒否", async ({ table, column, name }) => {
  // Identifiers come only from the checked-in Drizzle schema; values are parameters.
  await rejectsDb(context.db.execute(sql`
    UPDATE ${sql.identifier(table)} SET ${sql.identifier(column)} = ${randomUUID()}
    WHERE ctid = (SELECT ctid FROM ${sql.identifier(table)} LIMIT 1)
  `), "23503", name);
});
it("DB-T10: S3キー重複を拒否", async () => {
  await rejectsDb(context.db.insert(s.meetingRecordings).values({ meetingId: fixture.meetingA.id, s3Key: fixture.recording.s3Key, contentType: "audio/webm" }), "23505", "meeting_recordings_s3_key_unique");
});

it.each([
  ["projects", "status", "invalid", "projects_status_check"],
  ["meeting_participants", "role", "invalid", "meeting_participants_role_check"],
  ["meeting_recordings", "status", "invalid", "meeting_recordings_status_check"],
  ["meeting_minutes", "status", "invalid", "meeting_minutes_status_check"],
  ["ticket_candidates", "type", "decision", "ticket_candidates_type_check"],
  ["ticket_candidates", "priority", "invalid", "ticket_candidates_priority_check"],
  ["ticket_candidates", "status", "invalid", "ticket_candidates_status_check"],
])("%s.%sの列挙値制約", async (table, column, value, constraint) => {
  await rejectsDb(context.db.execute(sql`UPDATE ${sql.identifier(table)} SET ${sql.identifier(column)} = ${value}`), "23514", constraint);
});
it.each(["started_at", "ended_at"])("発言時刻%sの負数を拒否", async (column) => {
  await rejectsDb(context.db.execute(sql`UPDATE meeting_transcripts SET ${sql.identifier(column)} = -0.001`), "23514");
});
it("minutes version=0を拒否", async () => {
  await rejectsDb(context.db.update(s.meetingMinutes).set({ version: 0 }), "23514", "meeting_minutes_version_check");
});
it.each([null, "0.0000", "1.0000"])("confidence境界値%sを許容", async (confidence) => {
  const [row] = await context.db.update(s.ticketCandidates).set({ confidence, priority: null }).returning();
  expect(row.confidence).toBe(confidence);
  expect(row.priority).toBeNull();
});
it("別meetingで同じsequence/versionを許容", async () => {
  await context.db.insert(s.meetingTranscripts).values({ meetingId: fixture.meetingB.id, speakerName: "Guest", startedAt: "0", endedAt: null, text: "test", sequenceNo: 1 });
  await context.db.insert(s.meetingMinutes).values({ meetingId: fixture.meetingB.id, createdBy: fixture.ownerB.id, version: 1 });
});
it("email重複を拒否", async () => {
  await rejectsDb(context.db.insert(s.users).values({ email: fixture.ownerA.email, name: "Duplicate" }), "23505");
});
it("organization membership重複を拒否", async () => {
  await rejectsDb(context.db.insert(s.organizationMembers).values({ organizationId: fixture.organizationA.id, userId: fixture.ownerA.id }), "23505");
});
it("project membership重複を拒否", async () => {
  await rejectsDb(context.db.insert(s.projectMembers).values({ projectId: fixture.projectA.id, userId: fixture.ownerA.id }), "23505");
});
it("同名の外部参加者を別UUIDで保持できる", async () => {
  const guests = await context.db.insert(s.meetingParticipants).values([
    { meetingId: fixture.meetingA.id, displayName: "Guest" },
    { meetingId: fixture.meetingA.id, displayName: "Guest" },
  ]).returning();
  expect(guests[0].id).not.toBe(guests[1].id);
  expect(guests.every((guest) => guest.userId === null)).toBe(true);
});
it("手動チケットは出典なしで複数保存できる", async () => {
  const rows = await context.db.insert(s.tickets).values([
    { projectId: fixture.projectA.id, createdBy: fixture.ownerA.id, title: "Manual 1" },
    { projectId: fixture.projectA.id, createdBy: fixture.ownerA.id, title: "Manual 2" },
  ]).returning();
  expect(rows.every((row) => row.sourceCandidateId === null && row.sourceMeetingId === null)).toBe(true);
});
it("同じ候補を複数チケットの出典にできない", async () => {
  await context.db.update(s.tickets).set({ sourceCandidateId: fixture.candidate.id });
  await rejectsDb(context.db.insert(s.tickets).values({ projectId: fixture.projectA.id, createdBy: fixture.ownerA.id, title: "Duplicate", sourceCandidateId: fixture.candidate.id }), "23505", "tickets_source_candidate_id_unique");
});
it("同じチケットを複数候補の登録先にできない", async () => {
  await context.db.update(s.ticketCandidates).set({ registeredTicketId: fixture.ticket.id });
  await rejectsDb(context.db.insert(s.ticketCandidates).values({ projectId: fixture.projectA.id, meetingId: fixture.meetingA.id, title: "Duplicate", registeredTicketId: fixture.ticket.id }), "23505", "ticket_candidates_registered_ticket_id_unique");
});
it("相互FKは候補→チケット→候補更新の順で設定・Relation参照できる", async () => {
  await context.db.update(s.tickets).set({ sourceMeetingId: fixture.meetingA.id, sourceCandidateId: fixture.candidate.id });
  await context.db.update(s.ticketCandidates).set({ registeredTicketId: fixture.ticket.id, status: "registered" });
  const row = await context.db.query.tickets.findFirst({ with: { sourceCandidate: { with: { registeredTicket: true } } } });
  expect(row?.sourceCandidate?.registeredTicket?.id).toBe(fixture.ticket.id);
});
it.each([
  ["organizations", "organization"], ["projects", "project"], ["meetings", "meeting"],
  ["meeting_minutes", "minutes"], ["users", "creator"], ["tickets", "comments"],
])("履歴を持つ%sの削除をRESTRICTする (%s)", async (table) => {
  await rejectsDb(context.db.execute(sql`DELETE FROM ${sql.identifier(table)}`), "23503");
});
it("候補を参照するチケットがあれば候補削除を拒否", async () => {
  await context.db.update(s.tickets).set({ sourceCandidateId: fixture.candidate.id });
  await rejectsDb(context.db.delete(s.ticketCandidates), "23503");
});
it("任意ユーザー参照は削除時にSET NULLし記録を残す", async () => {
  const [user] = await context.db.insert(s.users).values({ name: "Temporary", email: "temporary@example.invalid" }).returning();
  await context.db.update(s.tickets).set({ assigneeId: user.id });
  await context.db.update(s.ticketCandidates).set({ assigneeId: user.id });
  await context.db.update(s.meetingTranscripts).set({ speakerUserId: user.id });
  await context.db.update(s.meetingParticipants).set({ userId: user.id }).where(isNotNull(s.meetingParticipants.userId));
  await context.db.update(s.auditLogs).set({ userId: user.id });
  await context.db.delete(s.users).where(eq(s.users.id, user.id));
  expect((await context.db.select().from(s.tickets))[0].assigneeId).toBeNull();
  expect((await context.db.select().from(s.ticketCandidates))[0].assigneeId).toBeNull();
  expect((await context.db.select().from(s.meetingTranscripts))[0].speakerUserId).toBeNull();
  expect((await context.db.select().from(s.meetingParticipants)).every((row) => row.userId === null)).toBe(true);
  expect((await context.db.select().from(s.auditLogs))[0].userId).toBeNull();
});
it("UUID・timestamp defaultとDrizzle更新時刻を検証", async () => {
  const old = new Date("2000-01-01T00:00:00Z");
  const [user] = await context.db.insert(s.users).values({ name: "Timestamp", email: "timestamp@example.invalid", updatedAt: old }).returning();
  expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(user.createdAt).toBeInstanceOf(Date);
  const [updated] = await context.db.update(s.users).set({ name: "Updated" }).where(eq(s.users.id, user.id)).returning();
  expect(updated.updatedAt.getTime()).toBeGreaterThan(old.getTime());
  expect(updated.createdAt).toEqual(user.createdAt);
});
it("数値精度・日付・JSONBを維持する", async () => {
  const [transcript] = await context.db.select().from(s.meetingTranscripts);
  expect(transcript.endedAt).toBe("1.500");
  const [recording] = await context.db.update(s.meetingRecordings).set({ fileSize: BigInt("9007199254740993") }).returning();
  expect(recording.fileSize).toBe(BigInt("9007199254740993"));
  const [ticket] = await context.db.update(s.tickets).set({ dueDate: "2026-09-30" }).returning();
  expect(ticket.dueDate).toBe("2026-09-30");
  const [minutes] = await context.db.update(s.meetingMinutes).set({ decisions: [{ text: "決定事項" }] }).returning();
  expect(minutes.decisions).toEqual([{ text: "決定事項" }]);
  expect((await context.db.select().from(s.ticketCandidates))[0].sourceTranscriptIds).toEqual([fixture.transcript.id]);
});
it("組織→Project→MeetingのRelationがテナント別に取得できる", async () => {
  const organization = await context.db.query.organizations.findFirst({
    where: eq(s.organizations.id, fixture.organizationA.id),
    with: { members: { with: { user: true } }, projects: { with: {
      members: true, tickets: { with: { comments: true } }, meetings: { with: {
        participants: true, transcripts: true, recordings: true, minutes: true, candidates: true,
      } },
    } } },
  });
  expect(organization?.members.map((row) => row.user.id).sort()).toEqual([fixture.ownerA.id, fixture.memberA.id, fixture.viewerA.id].sort());
  expect(organization?.projects.map((row) => row.id)).toEqual([fixture.projectA.id]);
  expect(organization?.projects[0].members.map((row) => row.role).sort()).toEqual(["member", "owner", "viewer"]);
  expect(organization?.projects[0].tickets[0].comments).toHaveLength(1);
  const meeting = organization?.projects[0].meetings[0];
  expect(meeting?.id).toBe(fixture.meetingA.id);
  expect(meeting?.participants).toHaveLength(2);
  for (const rows of [meeting?.transcripts, meeting?.recordings, meeting?.minutes, meeting?.candidates]) expect(rows).toHaveLength(1);
});
it("Userの所属・担当Ticket・作成MeetingのRelationが解決できる", async () => {
  const member = await context.db.query.users.findFirst({ where: eq(s.users.id, fixture.memberA.id), with: { organizationMemberships: true, projectMemberships: true, assignedTickets: true } });
  expect(member?.organizationMemberships[0].organizationId).toBe(fixture.organizationA.id);
  expect(member?.projectMemberships[0].projectId).toBe(fixture.projectA.id);
  expect(member?.assignedTickets[0].id).toBe(fixture.ticket.id);
  const owner = await context.db.query.users.findFirst({ where: eq(s.users.id, fixture.ownerA.id), with: { createdMeetings: true, createdTickets: true } });
  expect(owner?.createdMeetings[0].id).toBe(fixture.meetingA.id);
  expect(owner?.createdTickets[0].id).toBe(fixture.ticket.id);
});
it("実DBのPK/FK/CHECK/UNIQUE/Index型と削除方針を確認", async () => {
  const constraints = await context.db.execute<{ contype: string; confdeltype: string }>(sql`
    SELECT c.contype, c.confdeltype FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'
  `);
  expect(constraints.filter((row) => row.contype === "p")).toHaveLength(16);
  expect(constraints.filter((row) => row.contype === "f")).toHaveLength(32);
  expect(constraints.filter((row) => row.contype === "u")).toHaveLength(6);
  expect(constraints.filter((row) => row.contype === "c")).toHaveLength(20);
  expect(constraints.filter((row) => row.contype === "f").every((row) => ["r", "n"].includes(row.confdeltype))).toBe(true);
  const indexes = await context.db.execute<{ indexname: string }>(sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`);
  expect(indexes.filter((row) => row.indexname.startsWith("idx_"))).toHaveLength(15);
  const timestamps = await context.db.execute<{ column_name: string; data_type: string }>(sql`
    SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND column_name IN ('created_at', 'updated_at', 'deleted_at', 'meeting_date', 'joined_at', 'left_at')
  `);
  expect(timestamps.every((column) => column.data_type === "timestamp with time zone")).toBe(true);
  const jsonColumns = await context.db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND data_type = 'jsonb'`);
  expect(jsonColumns).toHaveLength(7);
});

it("候補への参照更新が失敗したら同じトランザクションのTicket挿入もロールバックできる", async () => {
  // Savepoint keeps this scenario inside the test's outer rollback transaction.
  await context.db.execute(sql`SAVEPOINT registration`);
  const [created] = await context.db.insert(s.tickets).values({
    projectId: fixture.projectA.id, title: "Rollback ticket", createdBy: fixture.ownerA.id, sourceCandidateId: fixture.candidate.id,
  }).returning();
  await rejectsDb(context.db.update(s.ticketCandidates).set({ registeredTicketId: randomUUID(), status: "registered" }), "23503");
  await context.db.execute(sql`ROLLBACK TO SAVEPOINT registration`);
  expect(await context.db.query.tickets.findFirst({ where: eq(s.tickets.id, created.id) })).toBeUndefined();
  const candidate = await context.db.query.ticketCandidates.findFirst({ where: eq(s.ticketCandidates.id, fixture.candidate.id) });
  expect(candidate?.registeredTicketId).toBeNull();
  expect(candidate?.status).toBe("pending");
});
