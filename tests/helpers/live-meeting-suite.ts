import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createTestDatabase, type TestDatabase } from "./postgres";
import { seedTestDatabase, type DatabaseFixture } from "../fixtures/db";
import { getDb } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/current-user";
import * as s from "@/lib/db/schema";
import { liveMeetingProvider } from "@/lib/livekit/provider";
import * as service from "@/lib/services/live-meeting-service";
import { updateMeeting, deleteMeeting } from "@/lib/services/meeting-service";
import * as start from "@/app/api/meetings/[id]/start/route";
import * as token from "@/app/api/meetings/[id]/token/route";
import * as join from "@/app/api/meetings/[id]/join/route";
import * as leave from "@/app/api/meetings/[id]/leave/route";
import * as end from "@/app/api/meetings/[id]/end/route";
export function liveMeetingSuite(security = false) {
 let context: TestDatabase; let f: DatabaseFixture; let meetingId: string; let pool: ReturnType<typeof postgres>; let concurrentDb: ReturnType<typeof getDb>;
 const params = () => ({ params: Promise.resolve({ id: meetingId }) });
 const req = (body = {}) => new Request("http://localhost:3100/api/live", { method: "POST", headers: { origin: "http://localhost:3100", "Content-Type": "application/json" }, body: JSON.stringify(body) });
 const login = (key: "ownerA" | "memberA" | "viewerA" | "ownerB") => vi.mocked(requireCurrentUser).mockResolvedValue(f[key]);
 const ctx = () => ({ userId: f.ownerA.id, meetingId, requestId: crypto.randomUUID() });
 const row = async () => (await context.db.select().from(s.meetings).where(eq(s.meetings.id, meetingId)))[0];
 beforeAll(async () => {
  context = await createTestDatabase(); await migrate(context.db, { migrationsFolder: "drizzle/migrations" }); f = await seedTestDatabase(context);
  const o = context.db.$client.options; pool = postgres({ host: o.host[0], port: o.port[0], username: "postgres", database: o.database, ssl: false, max: 8 }); concurrentDb = drizzle(pool, { schema: s });
 }, 120000);
 beforeEach(async () => {
  vi.mocked(getDb).mockReturnValue(context.db); login("ownerA"); vi.stubEnv("AUTH_URL", "http://localhost:3100"); vi.stubEnv("LIVE_MEETING_ENABLED", "true"); vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(liveMeetingProvider.ensureRoom).mockResolvedValue(); vi.mocked(liveMeetingProvider.endRoom).mockResolvedValue(); vi.mocked(liveMeetingProvider.hasParticipant).mockResolvedValue(true); vi.mocked(liveMeetingProvider.createParticipantToken).mockResolvedValue({ token: "PRIVATE_TOKEN", serverUrl: "wss://local.invalid", expiresIn: 1800 });
  await context.db.delete(s.auditLogs).where(sql`${s.auditLogs.action} like 'meeting.live.%'`);
  const [m] = await context.db.insert(s.meetings).values({ projectId: f.projectA.id, title: "Live", meetingDate: new Date(), createdBy: f.ownerA.id }).returning(); meetingId = m.id;
 });
 afterEach(async () => { await context.db.execute(sql`DROP TRIGGER IF EXISTS live_failure ON meetings`); await context.db.execute(sql`DROP FUNCTION IF EXISTS live_failure()`); });
 afterAll(async () => { await pool?.end({ timeout: 5 }); await context?.close(); }, 30000);
 it("LK-T03/05/12 cross tenant all operations; viewer start/end denied", async () => {
  login("ownerB"); for (const api of [start, token, join, leave, end]) expect((await api.POST(req(), params())).status).toBe(404);
  login("viewerA"); for (const api of [start, end]) expect((await api.POST(req(), params())).status).toBe(403);
  expect(liveMeetingProvider.ensureRoom).not.toHaveBeenCalled(); expect(liveMeetingProvider.createParticipantToken).not.toHaveBeenCalled();
 });
 it.each(["role", "identity", "roomName", "canPublish", "projectId", "organizationId", "userId", "joinedAt", "leftAt"])("SEC-LK-05/06/07 input %s rejected", async (key) => { for (const api of [start, token, join, leave, end]) expect((await api.POST(req({ [key]: "tamper" }), params())).status).toBe(400); });
 it("LK-T04 SEC-LK-08 role comes from DB including viewer subscribe-only", async () => {
  await service.startLiveMeeting(ctx(), context.db);
  for (const actor of ["ownerA", "memberA", "viewerA"] as const) { login(actor); const response = await token.POST(req(), params()); expect(response.status).toBe(200); expect((await response.json()).data.canPublish).toBe(actor !== "viewerA"); expect(liveMeetingProvider.createParticipantToken).toHaveBeenLastCalledWith(expect.objectContaining({ identity: `user_${f[actor].id}`, role: actor === "ownerA" ? "owner" : actor === "memberA" ? "member" : "viewer" })); }
 });
 it.each(["scheduled", "processing", "completed", "failed"] as const)("LK-T06/SEC-LK-10 token denied for %s", async (status) => { await context.db.update(s.meetings).set({ status }).where(eq(s.meetings.id, meetingId)); expect((await token.POST(req(), params())).status).toBe(409); expect(liveMeetingProvider.createParticipantToken).not.toHaveBeenCalled(); });
 it("SEC-LK-09 DB-backed limit", async () => { await service.startLiveMeeting(ctx(), context.db); await context.db.insert(s.auditLogs).values(Array.from({ length: 30 }, () => ({ organizationId: f.organizationA.id, userId: f.ownerA.id, action: "meeting.live.token.issue", resourceType: "meeting", resourceId: meetingId }))); for (const api of [start, token, end]) expect((await api.POST(req(), params())).status).toBe(429); });
 it("SEC-LK-02/03 token not persisted/logged and server metadata only", async () => {
  await service.startLiveMeeting(ctx(), context.db); const response = await token.POST(req(), params()); expect(response.headers.get("cache-control")).toBe("no-store"); const body = await response.json(); expect(body.data).not.toHaveProperty("LIVEKIT_API_SECRET");
  const text = JSON.stringify([await context.db.select().from(s.auditLogs), await row(), vi.mocked(console.info).mock.calls]); expect(text).not.toContain("PRIVATE_TOKEN");
 });
 it("CSRF rejected and unauthenticated cannot issue", async () => { const r = req(); r.headers.set("origin", "https://evil.invalid"); expect((await token.POST(r, params())).status).toBe(403); const { AccessError } = await import("@/lib/permissions/errors"); vi.mocked(requireCurrentUser).mockRejectedValue(new AccessError("UNAUTHENTICATED")); expect((await token.POST(req(), params())).status).toBe(401); });
 it("client telemetry is bounded, tenant scoped, and cannot change meeting state", async () => {
  await service.startLiveMeeting(ctx(), context.db);
  await expect(service.recordLiveConnectionEvent({ ...ctx(), userId: f.ownerB.id }, { state: "failed" }, context.db)).rejects.toMatchObject({ status: 404 });
  await expect(async () => service.recordLiveConnectionEvent(ctx(), { state: "failed", token: "PRIVATE" }, context.db)).rejects.toMatchObject({ status: 400 });
  await service.recordLiveConnectionEvent(ctx(), { state: "reconnecting" }, context.db); expect((await row()).status).toBe("recording");
 });
 if (security) return;
 it.each(["ownerA", "memberA"] as const)("LK-T01/02 start %s is idempotent", async (actor) => { login(actor); for (let i = 0; i < 2; i++) expect((await start.POST(req(), params())).status).toBe(200); expect(await row()).toMatchObject({ status: "recording", liveStartedAt: expect.any(Date) }); expect(liveMeetingProvider.ensureRoom).toHaveBeenLastCalledWith(`meeting_${meetingId}`); });
 it("LK-T08/09/10 connected join, leave and rejoin reuse participant", async () => {
  await service.startLiveMeeting(ctx(), context.db); for (const api of [join, join, leave, join]) expect((await api.POST(req(), params())).status).toBe(200);
  const rows = await context.db.select().from(s.meetingParticipants).where(eq(s.meetingParticipants.meetingId, meetingId)); expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ joinedAt: expect.any(Date), leftAt: null }); expect((await row()).status).toBe("recording");
  await leave.POST(req(), params()); expect((await context.db.select().from(s.meetingParticipants).where(eq(s.meetingParticipants.meetingId, meetingId)))[0].leftAt).toBeInstanceOf(Date);
 });
 it("token request alone does not record attendance; join verifies provider", async () => { await service.startLiveMeeting(ctx(), context.db); await token.POST(req(), params()); vi.mocked(liveMeetingProvider.hasParticipant).mockResolvedValue(false); expect((await join.POST(req(), params())).status).toBe(409); expect(await context.db.select().from(s.meetingParticipants).where(eq(s.meetingParticipants.meetingId, meetingId))).toHaveLength(0); });
 it("LK-T11/13 end idempotent and blocks new tokens", async () => { await service.startLiveMeeting(ctx(), context.db); for (let i = 0; i < 2; i++) expect((await end.POST(req(), params())).status).toBe(200); expect(await row()).toMatchObject({ status: "completed", liveEndedAt: expect.any(Date) }); expect((await token.POST(req(), params())).status).toBe(409); });
 it("start provider failure leaves scheduled, safe audit and retry", async () => { vi.mocked(liveMeetingProvider.ensureRoom).mockRejectedValueOnce(new Error("RAW_SECRET")); const response = await start.POST(req(), params()); expect(response.status).toBe(502); expect(JSON.stringify(await response.json())).not.toContain("RAW_SECRET"); expect((await row()).status).toBe("scheduled"); expect((await start.POST(req(), params())).status).toBe(200); });
 it("end provider failure persists stop intent, retry while flag disabled", async () => { await service.startLiveMeeting(ctx(), context.db); vi.mocked(liveMeetingProvider.endRoom).mockRejectedValueOnce(new Error("RAW_SECRET")); expect((await end.POST(req(), params())).status).toBe(502); expect((await row()).liveEndedAt).toBeInstanceOf(Date); expect((await token.POST(req(), params())).status).toBe(409); vi.stubEnv("LIVE_MEETING_ENABLED", "false"); expect((await end.POST(req(), params())).status).toBe(200); });
 it("start DB failure leaves deterministic orphan room recoverable", async () => {
  await context.db.execute(sql`CREATE FUNCTION live_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'PRIVATE_DB'; END; $$`); await context.db.execute(sql`CREATE TRIGGER live_failure BEFORE UPDATE ON meetings FOR EACH ROW EXECUTE FUNCTION live_failure()`);
  expect((await start.POST(req(), params())).status).toBe(502); expect((await row()).status).toBe("scheduled"); await context.db.execute(sql`DROP TRIGGER live_failure ON meetings`); expect((await start.POST(req(), params())).status).toBe(200);
 });
 it("Room delete success / DB completion failure retains end intent and retries", async () => {
  await service.startLiveMeeting(ctx(), context.db);
  await context.db.execute(sql`CREATE FUNCTION live_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'completed' THEN RAISE EXCEPTION 'PRIVATE_DB'; END IF; RETURN NEW; END; $$`);
  await context.db.execute(sql`CREATE TRIGGER live_failure BEFORE UPDATE ON meetings FOR EACH ROW EXECUTE FUNCTION live_failure()`);
  expect((await end.POST(req(), params())).status).toBe(502); expect(liveMeetingProvider.endRoom).toHaveBeenCalled(); expect((await row()).liveEndedAt).toBeInstanceOf(Date); expect((await token.POST(req(), params())).status).toBe(409);
  await context.db.execute(sql`DROP TRIGGER live_failure ON meetings`); expect((await end.POST(req(), params())).status).toBe(200);
 });
 it("concurrent start/end serialize against separate connections", async () => { await Promise.all(Array.from({ length: 4 }, () => service.startLiveMeeting(ctx(), concurrentDb))); await Promise.all(Array.from({ length: 4 }, () => service.endLiveMeeting(ctx(), concurrentDb))); expect((await row()).status).toBe("completed"); });
 it("manual status/delete cannot bypass online lifecycle", async () => { await service.startLiveMeeting(ctx(), context.db); await expect(updateMeeting(f.ownerA.id, meetingId, { status: "completed" }, context.db)).rejects.toMatchObject({ code: "MEETING_INVALID_STATUS" }); await expect(deleteMeeting(f.ownerA.id, meetingId, context.db)).rejects.toMatchObject({ code: "MEETING_NOT_EMPTY" }); });
 it("end retry preserves a subsequent AI processing status", async () => { await service.startLiveMeeting(ctx(), context.db); await service.endLiveMeeting(ctx(), context.db); await context.db.update(s.meetings).set({ status: "processing" }).where(eq(s.meetings.id, meetingId)); expect((await end.POST(req(), params())).status).toBe(200); expect((await row()).status).toBe("processing"); });
 it("leave/end never invent attendance for an unjoined participant", async () => { await context.db.insert(s.meetingParticipants).values({ meetingId, userId: f.ownerA.id, displayName: "Owner", role: "host" }); await service.startLiveMeeting(ctx(), context.db); await service.leaveLiveMeeting(ctx(), context.db); await service.endLiveMeeting(ctx(), context.db); const [p] = await context.db.select().from(s.meetingParticipants).where(eq(s.meetingParticipants.meetingId, meetingId)); expect(p.joinedAt).toBeNull(); expect(p.leftAt).toBeNull(); });
 it("feature disabled only stops online starts/token", async () => { vi.stubEnv("LIVE_MEETING_ENABLED", "false"); expect((await start.POST(req(), params())).status).toBe(503); expect((await row()).status).toBe("scheduled"); });
}
