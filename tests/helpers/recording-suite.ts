import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { getDb } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { recordingStorage } from "@/lib/s3/recording-storage";
import * as s from "@/lib/db/schema";
import * as service from "@/lib/services/meeting-recording-service";
import * as upload from "@/app/api/meetings/[id]/recordings/upload-url/route";
import * as list from "@/app/api/meetings/[id]/recordings/route";
import * as detail from "@/app/api/recordings/[id]/route";
import * as complete from "@/app/api/recordings/[id]/complete/route";
import * as download from "@/app/api/recordings/[id]/download-url/route";
import * as retry from "@/app/api/recordings/[id]/upload-url/route";
import { createTestDatabase, type TestDatabase } from "./postgres";
import { seedTestDatabase, type DatabaseFixture } from "../fixtures/db";
export function recordingSuite(security = false) {
 let context: TestDatabase; let f: DatabaseFixture; let meetingId: string; let recordingId: string;
 let pool: ReturnType<typeof postgres>; let concurrentDb: ReturnType<typeof getDb>;
 const params = (id: string) => ({ params: Promise.resolve({ id }) });
 const req = (body: unknown = {}, method = "POST") => new Request("http://localhost:3100/api/recordings", { method, headers: { origin: "http://localhost:3100", "Content-Type": "application/json" }, ...(method === "GET" ? {} : { body: JSON.stringify(body) }) });
 const login = (key: "ownerA" | "memberA" | "viewerA" | "ownerB") => vi.mocked(requireCurrentUser).mockResolvedValue(f[key]);
 const ctx = () => ({ userId: f.ownerA.id, requestId: crypto.randomUUID() });
 const row = async () => (await context.db.select().from(s.meetingRecordings).where(eq(s.meetingRecordings.id, recordingId)))[0];
 const validObject = () => vi.mocked(recordingStorage.headObject).mockResolvedValue({ contentType: "audio/webm", fileSize: 3 });
 beforeAll(async () => {
  context = await createTestDatabase(); await migrate(context.db, { migrationsFolder: "drizzle/migrations" }); f = await seedTestDatabase(context);
  const options = context.db.$client.options; pool = postgres({ host: options.host[0], port: options.port[0], username: "postgres", database: options.database, ssl: false, max: 8 }); concurrentDb = drizzle(pool, { schema: s });
 }, 120000);
 beforeEach(async () => {
  vi.mocked(getDb).mockReturnValue(context.db); login("ownerA"); vi.stubEnv("AUTH_URL", "http://localhost:3100"); vi.stubEnv("MAX_RECORDING_FILE_SIZE_BYTES", "1000");
  vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(recordingStorage.headObject).mockResolvedValue(null);
  vi.mocked(recordingStorage.createUploadUrl).mockResolvedValue({ url: "https://storage.invalid/SECRET_SIGNATURE", headers: { "Content-Type": "audio/webm" } });
  vi.mocked(recordingStorage.createDownloadUrl).mockResolvedValue("https://storage.invalid/SECRET_SIGNATURE");
  vi.mocked(recordingStorage.deleteObject).mockResolvedValue();
  await context.db.delete(s.auditLogs).where(eq(s.auditLogs.resourceType, "recording"));
  const [m] = await context.db.insert(s.meetings).values({ projectId: f.projectA.id, title: "録音テスト", meetingDate: new Date(), createdBy: f.ownerA.id }).returning(); meetingId = m.id;
  recordingId = (await service.createRecordingUpload(ctx(), meetingId, { contentType: "audio/webm", fileSize: 3 }, context.db)).recordingId;
 });
 afterEach(async () => { await context.db.execute(sql`DROP TRIGGER IF EXISTS recording_failure ON meeting_recordings`); await context.db.execute(sql`DROP FUNCTION IF EXISTS recording_failure()`); });
 afterAll(async () => { await pool?.end({ timeout: 5 }); await context?.close(); }, 30000);
 it("REC-T02/03 SEC-S3-02/03/04/10 all endpoints enforce tenant and write role", async () => {
  for (const actor of ["ownerB", "viewerA"] as const) {
   login(actor); const status = actor === "ownerB" ? 404 : 403;
   expect((await upload.POST(req({ contentType: "audio/webm", fileSize: 3 }), params(meetingId))).status).toBe(status);
   for (const api of [complete, retry]) expect((await api.POST(req(), params(recordingId))).status).toBe(status);
   expect((await detail.DELETE(req({}, "DELETE"), params(recordingId))).status).toBe(status);
   if (actor === "ownerB") {
    expect((await list.GET(req({}, "GET"), params(meetingId))).status).toBe(404);
    expect((await detail.GET(req({}, "GET"), params(recordingId))).status).toBe(404);
    expect((await download.POST(req(), params(recordingId))).status).toBe(404);
   }
  }
 });
 it.each(["s3Key", "bucket", "meetingId", "projectId", "organizationId", "status", "recordingId", "durationSeconds"])("SEC-S3-05 rejects %s override", async (key) => {
  expect((await upload.POST(req({ contentType: "audio/webm", fileSize: 3, [key]: "../../other" }), params(meetingId))).status).toBe(422);
  for (const api of [complete, retry, download]) expect((await api.POST(req({ [key]: "tamper" }), params(recordingId))).status).toBe(400);
 });
 it("REC-T04/05 SEC-S3-06/07 type and size checks", async () => {
  for (const [body, status] of [[{ contentType: "text/html", fileSize: 3 }, 422], [{ contentType: "audio/webm", fileSize: 1001 }, 413], [{ contentType: "audio/webm", fileSize: 0 }, 422], [{ contentType: "audio/webm", fileSize: 1.5 }, 422]] as const) expect((await upload.POST(req(body), params(meetingId))).status).toBe(status);
 });
 it.each([["text/html", 3, "RECORDING_CONTENT_TYPE_MISMATCH"], ["audio/webm", 1001, "RECORDING_FILE_TOO_LARGE"], ["audio/webm", 4, "RECORDING_SIZE_MISMATCH"], ["audio/webm", 0, "RECORDING_SIZE_MISMATCH"]] as const)("REC-T08/09 HEAD rejects %s %s", async (contentType, fileSize, code) => {
  vi.mocked(recordingStorage.headObject).mockResolvedValue({ contentType, fileSize });
  const response = await complete.POST(req(), params(recordingId)); expect((await response.json()).error.code).toBe(code); expect((await row()).status).toBe("failed"); expect((await download.POST(req(), params(recordingId))).status).toBe(409);
 });
 it("SEC-S3-08 safe responses and audit/log metadata", async () => {
  validObject(); expect((await complete.POST(req(), params(recordingId))).status).toBe(200); expect((await download.POST(req(), params(recordingId))).status).toBe(200);
  const body = JSON.stringify(await (await detail.GET(req({}, "GET"), params(recordingId))).json()); expect(body).not.toContain("s3Key"); expect(body).not.toContain("organizations/");
  const logs = JSON.stringify([vi.mocked(console.info).mock.calls, await context.db.select().from(s.auditLogs)]); expect(logs).not.toContain("SECRET_SIGNATURE");
  expect(vi.mocked(console.info).mock.calls.some(([message]) => String(message).includes(f.projectA.id) && String(message).includes(meetingId))).toBe(true);
 });
 it("CSRF and unauthenticated requests rejected before storage", async () => {
  const request = req(); request.headers.set("origin", "https://evil.invalid"); expect((await complete.POST(request, params(recordingId))).status).toBe(403);
  const { AccessError } = await import("@/lib/permissions/errors"); vi.mocked(requireCurrentUser).mockRejectedValue(new AccessError("UNAUTHENTICATED")); expect((await download.POST(req(), params(recordingId))).status).toBe(401);
 });
 if (security) return;
 it("REC-T01 metadata precedes signing, owner/member can create; no filename in key", async () => {
  login("memberA"); const response = await upload.POST(req({ contentType: "audio/webm", fileSize: 3 }), params(meetingId)); expect(response.status).toBe(201); expect((await response.json()).data.uploadUrl).toBeTruthy();
  expect(await row()).toMatchObject({ status: "uploading", fileSize: BigInt(3), durationSeconds: null }); expect((await row()).s3Key).toBe(`organizations/${f.organizationA.id}/projects/${f.projectA.id}/meetings/${meetingId}/recordings/${recordingId}.webm`);
 });
 it("REC-T06/10 actual metadata and idempotent complete", async () => { validObject(); for (let i = 0; i < 2; i++) expect((await complete.POST(req(), params(recordingId))).status).toBe(200); expect(await row()).toMatchObject({ status: "uploaded", fileSize: BigInt(3) }); expect((await row()).uploadedAt).toBeInstanceOf(Date); });
 it("REC-T07 missing object stays retryable", async () => { expect((await complete.POST(req(), params(recordingId))).status).toBe(409); expect((await row()).status).toBe("uploading"); expect((await retry.POST(req(), params(recordingId))).status).toBe(200); });
 it("REC-T11 viewer reads and downloads", async () => { validObject(); await service.completeRecordingUpload(ctx(), recordingId, context.db); login("viewerA"); expect((await list.GET(req({}, "GET"), params(meetingId))).status).toBe(200); expect((await detail.GET(req({}, "GET"), params(recordingId))).status).toBe(200); expect((await download.POST(req(), params(recordingId))).status).toBe(200); });
 it.each(["uploading", "failed"] as const)("REC-T13/14 download %s denied", async (status) => { await context.db.update(s.meetingRecordings).set({ status }).where(eq(s.meetingRecordings.id, recordingId)); expect((await download.POST(req(), params(recordingId))).status).toBe(409); });
 it("REC-T15/18 delete failure retains row then retry hides metadata with tombstone", async () => {
  vi.mocked(recordingStorage.deleteObject).mockRejectedValueOnce(new Error("RAW_SECRET")); expect((await detail.DELETE(req({}, "DELETE"), params(recordingId))).status).toBe(502); expect((await row()).deletedAt).toBeNull();
  expect((await detail.DELETE(req({}, "DELETE"), params(recordingId))).status).toBe(200); expect((await row()).deletedAt).toBeInstanceOf(Date); expect((await row()).uploadExpiresAt).toBeInstanceOf(Date);
  expect((await detail.GET(req({}, "GET"), params(recordingId))).status).toBe(404); expect((await download.POST(req(), params(recordingId))).status).toBe(404); expect((await detail.DELETE(req({}, "DELETE"), params(recordingId))).status).toBe(404);
 });
 it("dependency blocks deletion before S3", async () => { await context.db.insert(s.meetingTranscripts).values({ meetingId, speakerName: "Guest", startedAt: "0", text: "Evidence", sequenceNo: 1 }); expect((await detail.DELETE(req({}, "DELETE"), params(recordingId))).status).toBe(409); expect(recordingStorage.deleteObject).not.toHaveBeenCalled(); });
 it("signing failure records failed and safe audit", async () => { vi.mocked(recordingStorage.createUploadUrl).mockRejectedValueOnce(new Error("RAW_SECRET")); const response = await retry.POST(req(), params(recordingId)); expect(response.status).toBe(502); expect(JSON.stringify(await response.json())).not.toContain("RAW_SECRET"); expect((await row()).status).toBe("failed"); });
 it("existing object cannot be reissued and completed object is immutable", async () => { validObject(); expect((await retry.POST(req(), params(recordingId))).status).toBe(409); await service.completeRecordingUpload(ctx(), recordingId, context.db); expect((await retry.POST(req(), params(recordingId))).status).toBe(409); });
 it("stale upload reissue marks failed", async () => { await context.db.update(s.meetingRecordings).set({ createdAt: new Date(Date.now() - 90000000) }).where(eq(s.meetingRecordings.id, recordingId)); expect((await retry.POST(req(), params(recordingId))).status).toBe(409); expect((await row()).status).toBe("failed"); });
 it("concurrent Complete uses actual separate connections safely", async () => { validObject(); const result = await Promise.all(Array.from({ length: 5 }, () => service.completeRecordingUpload(ctx(), recordingId, concurrentDb))); expect(result.every((r) => r.status === "uploaded")).toBe(true); });
 it("concurrent Delete succeeds once with stable not-found on second", async () => { const result = await Promise.allSettled([service.deleteRecording(ctx(), recordingId, concurrentDb), service.deleteRecording(ctx(), recordingId, concurrentDb)]); expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1); expect((await row()).deletedAt).not.toBeNull(); });
 it("S3 success / DB failure preserves metadata and can be reconciled by retry", async () => {
  await context.db.execute(sql`CREATE FUNCTION recording_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'PRIVATE_FAILURE'; END; $$`);
  await context.db.execute(sql`CREATE TRIGGER recording_failure BEFORE UPDATE ON meeting_recordings FOR EACH ROW EXECUTE FUNCTION recording_failure()`);
  expect((await detail.DELETE(req({}, "DELETE"), params(recordingId))).status).toBe(500); expect(recordingStorage.deleteObject).toHaveBeenCalled(); expect((await row()).deletedAt).toBeNull();
  await context.db.execute(sql`DROP TRIGGER recording_failure ON meeting_recordings`); expect((await detail.DELETE(req({}, "DELETE"), params(recordingId))).status).toBe(200);
 });
 it("DB INSERT failure never issues a signed URL", async () => {
  await context.db.execute(sql`CREATE FUNCTION recording_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'PRIVATE_FAILURE'; END; $$`);
  await context.db.execute(sql`CREATE TRIGGER recording_failure BEFORE INSERT ON meeting_recordings FOR EACH ROW EXECUTE FUNCTION recording_failure()`);
  const calls = vi.mocked(recordingStorage.createUploadUrl).mock.calls.length;
  expect((await upload.POST(req({ contentType: "audio/webm", fileSize: 3 }), params(meetingId))).status).toBe(500);
  expect(recordingStorage.createUploadUrl).toHaveBeenCalledTimes(calls);
 });
 it("database-backed rate limit bounds URL issuance", async () => { await context.db.insert(s.auditLogs).values(Array.from({ length: 30 }, () => ({ organizationId: f.organizationA.id, userId: f.ownerA.id, action: "recording.upload_url.issue", resourceType: "recording", resourceId: recordingId }))); expect((await retry.POST(req(), params(recordingId))).status).toBe(429); });
 it("archived Project blocks writes but uploaded files remain readable", async () => {
  validObject(); await service.completeRecordingUpload(ctx(), recordingId, context.db); await context.db.update(s.projects).set({ status: "archived" }).where(eq(s.projects.id, f.projectA.id));
  try { expect((await detail.DELETE(req({}, "DELETE"), params(recordingId))).status).toBe(409); expect((await download.POST(req(), params(recordingId))).status).toBe(200); }
  finally { await context.db.update(s.projects).set({ status: "active" }).where(eq(s.projects.id, f.projectA.id)); }
 });
 it("pagination excludes deleted rows", async () => { await service.deleteRecording(ctx(), recordingId, context.db); expect((await service.listRecordings(f.ownerA.id, meetingId, {}, context.db)).data).toHaveLength(0); expect(await context.db.select().from(s.auditLogs).where(and(eq(s.auditLogs.resourceId, recordingId), eq(s.auditLogs.action, "recording.delete")))).toHaveLength(1); });
}
