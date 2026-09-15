import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { getDb } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { AccessError } from "@/lib/permissions/errors";
import * as s from "@/lib/db/schema";
import { createMeeting, getMeeting } from "@/lib/services/meeting-service";
import { addParticipant, removeParticipant } from "@/lib/services/meeting-participant-service";
import { createTranscript } from "@/lib/services/meeting-transcript-service";
import { loadMeetingAIContext } from "@/lib/services/meeting-ai-context";
import * as collection from "@/app/api/projects/[id]/meetings/route";
import * as detail from "@/app/api/meetings/[id]/route";
import * as participants from "@/app/api/meetings/[id]/participants/route";
import * as participant from "@/app/api/meetings/[id]/participants/[participantId]/route";
import * as transcripts from "@/app/api/meetings/[id]/transcripts/route";
import * as transcript from "@/app/api/meetings/[id]/transcripts/[transcriptId]/route";
import * as bulk from "@/app/api/meetings/[id]/transcripts/bulk/route";
import * as join from "@/app/api/meetings/[id]/participants/me/join/route";
import * as leave from "@/app/api/meetings/[id]/participants/me/leave/route";
import { createTestDatabase, type TestDatabase } from "./postgres";
import { seedTestDatabase, type DatabaseFixture } from "../fixtures/db";
export function meetingSuite(security = false) {
 let context: TestDatabase; let f: DatabaseFixture; let m: Awaited<ReturnType<typeof createMeeting>>;
 const params = (id: string) => ({ params: Promise.resolve({ id }) });
 const partParams = (participantId: string, id = m.id) => ({ params: Promise.resolve({ id, participantId }) });
 const trParams = (transcriptId: string, id = m.id) => ({ params: Promise.resolve({ id, transcriptId }) });
 const request = (method = "GET", body?: unknown, query = "") => new Request(`http://localhost:3100/api/meetings${query}`, { method, headers: { origin: "http://localhost:3100", "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
 const speech = (sequenceNo = 1) => ({ speakerName: "Speaker", speakerUserId: f.memberA.id, startedAt: 12.2, endedAt: 18.7, text: "Test transcript", sequenceNo });
 const login = (key: "ownerA" | "memberA" | "viewerA" | "ownerB") => vi.mocked(requireCurrentUser).mockResolvedValue(f[key]);
 beforeAll(async () => { context = await createTestDatabase(); await migrate(context.db, { migrationsFolder: "drizzle/migrations" }); f = await seedTestDatabase(context); }, 120000);
 beforeEach(async () => { vi.mocked(getDb).mockReturnValue(context.db); login("ownerA"); vi.stubEnv("AUTH_URL", "http://localhost:3100"); vi.spyOn(console, "warn").mockImplementation(() => {}); m = await createMeeting(f.ownerA.id, f.projectA.id, { title: "Meeting test", meetingDate: "2026-09-16T10:00:00+09:00" }, context.db); });
 afterAll(async () => { if (context) await context.close(); }, 30000);
 it("未認証の一覧401", async () => { vi.mocked(requireCurrentUser).mockRejectedValue(new AccessError("UNAUTHENTICATED")); expect((await collection.GET(request(), params(f.projectA.id))).status).toBe(401); });
 it("MTG-T04 SEC-MTG-01 別Tenant Meeting操作拒否", async () => {
  login("ownerB");
  for (const response of [await collection.GET(request(), params(f.projectA.id)), await detail.GET(request(), params(m.id)), await detail.PATCH(request("PATCH", { title: "Attack" }), params(m.id)), await detail.DELETE(request("DELETE"), params(m.id)), await participants.GET(request(), params(m.id)), await participants.POST(request("POST", { displayName: "Attack" }), params(m.id)), await participant.PATCH(request("PATCH", { displayName: "Attack" }), partParams(m.participants[0].id)), await participant.DELETE(request("DELETE"), partParams(m.participants[0].id)), await transcripts.GET(request(), params(m.id)), await transcripts.POST(request("POST", speech()), params(m.id)), await bulk.POST(request("POST", { transcripts: [speech()] }), params(m.id)), await transcript.PATCH(request("PATCH", { text: "Attack" }), trParams(f.transcript.id)), await transcript.DELETE(request("DELETE"), trParams(f.transcript.id))]) expect(response.status).toBe(404);
  await expect(loadMeetingAIContext(f.ownerB.id, m.id, context.db)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
 });
 it("MTG-T03/06 PRT-T04 TRN-T07 viewer Read Only", async () => {
  login("viewerA"); expect((await detail.GET(request(), params(m.id))).status).toBe(200);
  for (const response of [await collection.POST(request("POST", { title: "x", meetingDate: "2026-09-16T01:00:00Z" }), params(f.projectA.id)), await detail.PATCH(request("PATCH", { title: "x" }), params(m.id)), await detail.DELETE(request("DELETE"), params(m.id)), await participants.POST(request("POST", { displayName: "x" }), params(m.id)), await participant.PATCH(request("PATCH", { role: "participant" }), partParams(m.participants[0].id)), await participant.DELETE(request("DELETE"), partParams(m.participants[0].id)), await transcripts.POST(request("POST", speech()), params(m.id)), await transcript.PATCH(request("PATCH", { text: "x" }), trParams(f.transcript.id)), await transcript.DELETE(request("DELETE"), trParams(f.transcript.id)), await bulk.POST(request("POST", { transcripts: [speech()] }), params(m.id))]) expect(response.status).toBe(403);
 });
 it.each(["projectId", "project_id", "createdBy", "created_at", "createdAt", "updatedAt", "role"])("SEC-MTG-02 %s mass assignment拒否", async (field) => {
  expect((await detail.PATCH(request("PATCH", { [field]: f.projectB.id }), params(m.id))).status).toBe(422);
  expect((await collection.POST(request("POST", { title: "x", meetingDate: "2026-09-16T01:00:00Z", [field]: f.projectB.id }), params(f.projectA.id))).status).toBe(422);
 });
 it("SEC-PRT-01 SEC-TRN-02 別Tenant Participant/speaker拒否", async () => {
  expect((await participants.POST(request("POST", { userId: f.ownerB.id }), params(m.id))).status).toBe(422);
  expect((await transcripts.POST(request("POST", { ...speech(), speakerUserId: f.ownerB.id }), params(m.id))).status).toBe(422);
 });
 it("SEC-TRN-01 子IDだけ別Meetingへ差し替えを拒否", async () => {
  expect((await transcript.PATCH(request("PATCH", { text: "Attack" }), trParams(f.transcript.id))).status).toBe(404);
  expect((await transcript.DELETE(request("DELETE"), trParams(f.transcript.id))).status).toBe(404);
  const [other] = await context.db.select().from(s.meetingParticipants).where(eq(s.meetingParticipants.meetingId, f.meetingA.id));
  expect((await participant.PATCH(request("PATCH", { role: "participant" }), partParams(other.id))).status).toBe(404);
  expect((await participant.DELETE(request("DELETE"), partParams(other.id))).status).toBe(404);
 });
 it.each(["meetingId", "meeting_id", "createdAt", "created_at"])("SEC-TRN-03 %s注入拒否", async (field) => {
  expect((await transcripts.POST(request("POST", { ...speech(), [field]: f.meetingB.id }), params(m.id))).status).toBe(422);
  expect((await transcript.PATCH(request("PATCH", { [field]: f.meetingB.id }), trParams(f.transcript.id))).status).toBe(422);
  expect((await participants.POST(request("POST", { displayName: "x", [field]: f.meetingB.id }), params(m.id))).status).toBe(422);
 });
 it("CSRF異なるOriginを拒否", async () => { const req = request("POST", speech()); req.headers.set("origin", "https://evil.invalid"); expect((await transcripts.POST(req, params(m.id))).status).toBe(403); });
 if (security) return;
 it.each(["ownerA", "memberA"] as const)("MTG-T01/02 %s作成者hostとDB actor固定", async (key) => {
  login(key); const response = await collection.POST(request("POST", { title: " New ", meetingDate: "2026-09-16T10:00:00+09:00" }), params(f.projectA.id)); expect(response.status).toBe(201); const { data } = await response.json(); expect(data).toMatchObject({ title: "New", status: "scheduled", createdBy: { id: f[key].id }, participants: [{ userId: f[key].id, displayName: f[key].name, role: "host" }] });
 });
 it("MTG-T05/07 状態遷移・更新・監査from/to", async () => {
  login("memberA"); expect((await detail.PATCH(request("PATCH", { title: "Updated" }), params(m.id))).status).toBe(200);
  expect((await detail.PATCH(request("PATCH", { status: "processing" }), params(m.id))).status).toBe(409);
  for (const status of ["recording", "failed", "processing", "failed", "processing", "completed"]) expect((await detail.PATCH(request("PATCH", { status }), params(m.id))).status).toBe(200);
  expect((await detail.PATCH(request("PATCH", { status: "recording" }), params(m.id))).status).toBe(409);
  const audit = await context.db.select().from(s.auditLogs).where(and(eq(s.auditLogs.resourceId, m.id), eq(s.auditLogs.action, "meeting.status.change"))).orderBy(s.auditLogs.createdAt); expect(audit[0].metadata).toMatchObject({ from: "scheduled", to: "recording" });
 });
 it("MTG-T08 空Meeting削除可能・関連データありは409", async () => {
  expect((await detail.DELETE(request("DELETE"), params(f.meetingA.id))).status).toBe(409);
  expect((await detail.DELETE(request("DELETE"), params(m.id))).status).toBe(204);
  expect((await detail.GET(request(), params(m.id))).status).toBe(404);
  expect(await context.db.select().from(s.meetingParticipants).where(eq(s.meetingParticipants.meetingId, m.id))).toHaveLength(0);
  expect(await context.db.select().from(s.auditLogs).where(eq(s.auditLogs.resourceId, m.id))).toHaveLength(2);
 });
 it("PRT-T01/03/05 internal/external・重複・host保護・更新・削除", async () => {
  const created = await participants.POST(request("POST", { userId: f.memberA.id }), params(m.id)); expect(created.status).toBe(201); const internal = (await created.json()).data;
  expect(internal.displayName).toBe(f.memberA.name); expect((await participants.POST(request("POST", { userId: f.memberA.id }), params(m.id))).status).toBe(409);
  expect((await participants.POST(request("POST", { displayName: "Guest" }), params(m.id))).status).toBe(201);
  expect((await participant.DELETE(request("DELETE"), partParams(m.participants[0].id))).status).toBe(409);
  expect((await participant.PATCH(request("PATCH", { role: "participant" }), partParams(m.participants[0].id))).status).toBe(409);
  expect((await participant.PATCH(request("PATCH", { role: "host", displayName: "Updated" }), partParams(internal.id))).status).toBe(200);
  expect((await participant.DELETE(request("DELETE"), partParams(m.participants[0].id))).status).toBe(204);
 });
 it("Join/Leaveは自分の行とサーバー時刻を使う", async () => {
  expect((await leave.POST(request("POST"), params(m.id))).status).toBe(409);
  const joined = (await (await join.POST(request("POST"), params(m.id))).json()).data;
  const left = (await (await leave.POST(request("POST"), params(m.id))).json()).data;
  expect(joined.userId).toBe(f.ownerA.id); expect(joined.joinedAt).not.toBeNull(); expect(new Date(left.leftAt).getTime()).toBeGreaterThanOrEqual(new Date(left.joinedAt).getTime());
 });
 it("TRN-T01/02 create・numeric出力・sequence conflict・PATCH merged validation", async () => {
  const response = await transcripts.POST(request("POST", speech()), params(m.id)); expect(response.status).toBe(201); const { data } = await response.json(); expect(data.startedAt).toBe(12.2);
  expect((await transcripts.POST(request("POST", speech()), params(m.id))).status).toBe(409);
  expect((await transcript.PATCH(request("PATCH", { startedAt: 20 }), trParams(data.id))).status).toBe(422);
  expect((await transcript.PATCH(request("PATCH", { text: "Corrected", endedAt: null }), trParams(data.id))).status).toBe(200);
  expect((await transcript.DELETE(request("DELETE"), trParams(data.id))).status).toBe(204);
 });
 it.each([{ startedAt: -1 }, { endedAt: 1 }, { text: " " }, { sequenceNo: 0 }, { startedAt: 1.1234 }, { startedAt: 1000000000 }])("TRN-T03〜05 validation %#", async (patch) => { expect((await transcripts.POST(request("POST", { ...speech(), ...patch }), params(m.id))).status).toBe(422); });
 it("TRN-B01/02/03/04 Bulk 100件・Rollback・サイズ上限・Pagination・AI全件", async () => {
  const rows = Array.from({ length: 100 }, (_, i) => speech(i + 1)); expect((await bulk.POST(request("POST", { transcripts: rows }), params(m.id))).status).toBe(201);
  expect((await bulk.POST(request("POST", { transcripts: [speech(101), { ...speech(102), text: "" }] }), params(m.id))).status).toBe(422);
  expect((await bulk.POST(request("POST", { transcripts: [speech(101), speech(1)] }), params(m.id))).status).toBe(409);
  expect((await bulk.POST(request("POST", { transcripts: Array.from({ length: 501 }, (_, i) => speech(i + 200)) }), params(m.id))).status).toBe(422);
  const first = await (await transcripts.GET(request("GET", undefined, "?limit=30"), params(m.id))).json(); expect(first.data.map((t: {sequenceNo: number}) => t.sequenceNo)).toEqual(Array.from({length: 30}, (_,i) => i + 1)); expect(first.meta.nextSequence).toBe(31);
  const next = await (await transcripts.GET(request("GET", undefined, "?fromSequence=31&limit=500"), params(m.id))).json(); expect(next.data).toHaveLength(70); expect(next.meta.nextSequence).toBeNull();
  const ai = await loadMeetingAIContext(f.ownerA.id, m.id, context.db); expect(ai.transcripts).toHaveLength(100); expect(ai.meeting.projectId).toBe(f.projectA.id); expect(ai.project.id).toBe(f.projectA.id); expect(ai.projectMembers.every((u) => u.userId !== f.ownerB.id)).toBe(true); expect(ai.transcripts.every((t) => t.meetingId === m.id)).toBe(true);
 });
 it("processing/completedでTranscript編集不可・既存Evidence保護", async () => {
  const row = (await (await transcripts.POST(request("POST", speech()), params(m.id))).json()).data;
  await detail.PATCH(request("PATCH", { status: "recording" }), params(m.id)); await detail.PATCH(request("PATCH", { status: "processing" }), params(m.id));
  expect((await transcript.PATCH(request("PATCH", { text: "late" }), trParams(row.id))).status).toBe(409);
  expect((await transcripts.POST(request("POST", speech(2)), params(m.id))).status).toBe(409);
  await detail.PATCH(request("PATCH", { status: "completed" }), params(m.id)); expect((await transcript.DELETE(request("DELETE"), trParams(row.id))).status).toBe(409);
  expect((await transcript.DELETE(request("DELETE"), trParams(f.transcript.id, f.meetingA.id))).status).toBe(409);
 });
 it("Meeting一覧Filter・JST日付境界・Sort・Pagination・件数", async () => {
  const response = await collection.GET(request("GET", undefined, "?status=scheduled&from=2026-09-16&to=2026-09-16&limit=1&page=1&sort=meetingDate&order=asc"), params(f.projectA.id)); const result = await response.json(); expect(response.status).toBe(200); expect(result.data).toHaveLength(1); expect(result.meta.total).toBeGreaterThan(0); expect(result.data[0].participantCount).toBeGreaterThan(0); expect(result.data[0].projectId).toBe(f.projectA.id);
  expect((await collection.GET(request("GET", undefined, "?from=2026-10-01&to=2026-09-01"), params(f.projectA.id))).status).toBe(422);
  expect((await collection.GET(request("GET", undefined, "?limit=101"), params(f.projectA.id))).status).toBe(422);
 });
 it("DB制約はAPI外からの不正時刻・sequence・重複参加者も拒否", async () => {
  await expect(context.db.insert(s.meetingTranscripts).values({ meetingId: m.id, speakerName: "x", startedAt: "2", endedAt: "1", text: "x", sequenceNo: 1 })).rejects.toThrow();
  await expect(context.db.insert(s.meetingTranscripts).values({ meetingId: m.id, speakerName: "x", startedAt: "0", text: "x", sequenceNo: 0 })).rejects.toThrow();
  await expect(context.db.insert(s.meetingParticipants).values({ meetingId: m.id, userId: f.ownerA.id, displayName: "duplicate", role: "host" })).rejects.toThrow();
 });
 it("監査失敗はMeeting+hostとBulkをRollback", async () => {
  const before = await context.db.select().from(s.meetings); const hostBefore = await context.db.select().from(s.meetingParticipants);
  await context.db.execute(sql`CREATE FUNCTION reject_meeting_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private audit failure'; END $$`);
  await context.db.execute(sql`CREATE TRIGGER reject_meeting_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_meeting_audit()`);
  try {
   expect((await collection.POST(request("POST", { title: "Rollback", meetingDate: "2026-09-16T01:00:00Z" }), params(f.projectA.id))).status).toBe(500);
   expect(await context.db.select().from(s.meetings)).toHaveLength(before.length); expect(await context.db.select().from(s.meetingParticipants)).toHaveLength(hostBefore.length);
   expect((await bulk.POST(request("POST", { transcripts: [speech(1), speech(2)] }), params(m.id))).status).toBe(500); expect(await context.db.select().from(s.meetingTranscripts).where(eq(s.meetingTranscripts.meetingId, m.id))).toHaveLength(0);
  } finally { await context.db.execute(sql`DROP TRIGGER reject_meeting_audit ON audit_logs`); await context.db.execute(sql`DROP FUNCTION reject_meeting_audit()`); }
 });
 it("複数接続のhost同時削除とsequence同時挿入を直列化", async () => {
  const second = await addParticipant(f.ownerA.id, m.id, { userId: f.memberA.id, role: "host" }, context.db);
  const options = context.db.$client.options;
  const client = postgres({ host: options.host[0], port: options.port[0], username: "postgres", database: options.database, ssl: false, max: 4 }); const db = drizzle(client, { schema: s });
  try {
   const removed = await Promise.allSettled([removeParticipant(f.ownerA.id, m.id, m.participants[0].id, db), removeParticipant(f.ownerA.id, m.id, second.id, db)]); expect(removed.filter((r) => r.status === "fulfilled")).toHaveLength(1);
   const inserted = await Promise.allSettled([createTranscript(f.ownerA.id, m.id, speech(), db), createTranscript(f.ownerA.id, m.id, speech(), db)]); expect(inserted.filter((r) => r.status === "fulfilled")).toHaveLength(1); expect(inserted.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "TRANSCRIPT_SEQUENCE_CONFLICT" } });
  } finally { await client.end({ timeout: 3 }); }
 });
 it("archiveはMeeting新規作成・更新を拒否、詳細は参照可能", async () => {
  await context.db.update(s.projects).set({ status: "archived" }).where(eq(s.projects.id, f.projectA.id));
  try { expect((await detail.PATCH(request("PATCH", { title: "no" }), params(m.id))).status).toBe(409); expect((await collection.POST(request("POST", { title: "no", meetingDate: "2026-09-16T01:00:00Z" }), params(f.projectA.id))).status).toBe(409); expect(await getMeeting(f.ownerA.id, m.id, context.db)).toMatchObject({ id: m.id }); }
  finally { await context.db.update(s.projects).set({ status: "active" }).where(eq(s.projects.id, f.projectA.id)); }
 });
}
