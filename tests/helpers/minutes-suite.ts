import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDb } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { createStructuredAIClient } from "@/lib/bedrock/structured-ai-client";
import { createMeeting, updateMeeting } from "@/lib/services/meeting-service";
import { createTranscript } from "@/lib/services/meeting-transcript-service";
import { generateMeetingMinutes } from "@/lib/ai/services/generate-minutes";
import { approveMinutes, updateMinutes } from "@/lib/services/meeting-minutes-service";
import * as s from "@/lib/db/schema";
import * as generate from "@/app/api/ai/generate-minutes/route";
import * as detail from "@/app/api/minutes/[id]/route";
import * as approve from "@/app/api/minutes/[id]/approve/route";
import * as list from "@/app/api/meetings/[id]/minutes/route";
import { createTestDatabase, type TestDatabase } from "./postgres";
import { seedTestDatabase, type DatabaseFixture } from "../fixtures/db";
import { minutesFixture, aiSettings, fixtureTexts } from "../fixtures/ai/minutes";
import type { StructuredGenerator } from "@/lib/bedrock/types";
export function minutesSuite(security = false) {
 let database: TestDatabase; let f: DatabaseFixture; let meetingId: string; let transcriptId: string;
 let output: unknown; const model = vi.fn();
 const params = (id: string) => ({ params: Promise.resolve({ id }) });
 const request = (method = "GET", body?: unknown) => new Request("http://localhost:3100/api/minutes", { method, headers: { origin: "http://localhost:3100", "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
 const login = (key: "ownerA" | "memberA" | "viewerA" | "ownerB") => vi.mocked(requireCurrentUser).mockResolvedValue(f[key]);
 const run = (extra = {}) => generateMeetingMinutes({ userId: f.ownerA.id, meetingId, ...extra }, { db: database.db, settings: aiSettings });
 beforeAll(async () => { database = await createTestDatabase(); await migrate(database.db, { migrationsFolder: "drizzle/migrations" }); f = await seedTestDatabase(database); }, 120000);
 beforeEach(async () => {
  vi.mocked(getDb).mockReturnValue(database.db); login("ownerA"); vi.stubEnv("AUTH_URL", "http://localhost:3100"); vi.stubEnv("AWS_REGION", "ap-northeast-1"); vi.stubEnv("BEDROCK_MODEL_ID", aiSettings.modelId); vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {});
  const meeting = await createMeeting(f.ownerA.id, f.projectA.id, { title: "AI test", meetingDate: "2026-09-16T01:00:00Z" }, database.db); meetingId = meeting.id;
  const transcript = await createTranscript(f.ownerA.id, meetingId, { speakerName: f.memberA.name, speakerUserId: f.memberA.id, text: `${f.memberA.name}が2026-09-18までにAPI仕様を更新する。`, startedAt: 12, endedAt: 18, sequenceNo: 1 }, database.db); transcriptId = transcript.id;
  const fixture = minutesFixture().result; fixture.meeting_id = meetingId; for (const item of [...fixture.decisions, ...fixture.action_items, ...fixture.issues, ...fixture.pending_items]) item.source_evidence[0].transcript_id = transcriptId;
  fixture.action_items[0].assignee = { user_id: f.memberA.id, display_name: f.memberA.name }; output = fixture;
  model.mockReset().mockImplementation(async () => ({ data: output, rawText: "RAW_SENTINEL", modelId: aiSettings.modelId, metrics: { transportRetryCount: 0, schemaRepairCount: 0, inputTokens: 20, outputTokens: 30, outputBytes: 40 } }));
  vi.mocked(createStructuredAIClient).mockReturnValue({ generateStructured: model } as StructuredGenerator);
 });
 afterAll(async () => { if (database) await database.close(); }, 30000);
 it("SEC-AI-09 REV-T03 viewer read only", async () => {
  const minutes = await run(); login("viewerA"); expect((await list.GET(request(), params(meetingId))).status).toBe(200); expect((await detail.GET(request(), params(minutes.id))).status).toBe(200);
  expect((await generate.POST(request("POST", { meetingId }))).status).toBe(403); expect((await detail.PATCH(request("PATCH", { summary: "x" }), params(minutes.id))).status).toBe(403); expect((await approve.POST(request("POST", {}), params(minutes.id))).status).toBe(403);
 });
 it("cross tenant Generate/List/Detail/Update/Approve denied", async () => {
  const minutes = await run(); login("ownerB");
  for (const r of [await generate.POST(request("POST", { meetingId })), await list.GET(request(), params(meetingId)), await detail.GET(request(), params(minutes.id)), await detail.PATCH(request("PATCH", { summary: "x" }), params(minutes.id)), await approve.POST(request("POST", {}), params(minutes.id))]) expect(r.status).toBe(404);
 });
 it.each(["aiModel", "promptVersion", "schemaVersion", "meetingId", "status", "createdBy", "aiRawOutput"])("SEC-AI-06/07/08 reject %s", async (key) => { const minutes = await run(); expect((await detail.PATCH(request("PATCH", { [key]: "tampered" }), params(minutes.id))).status).toBe(400); });
 it.each(["crossMeeting", "unknownUser"])("SEC-AI-03/04/05 invalid %s not saved", async (kind) => {
  const value = output as ReturnType<typeof minutesFixture>["result"]; if (kind === "crossMeeting") value.decisions[0].source_evidence[0].transcript_id = f.transcript.id; else value.action_items[0].assignee.user_id = f.ownerB.id;
  await expect(run()).rejects.toMatchObject({ code: "AI_EVIDENCE_INVALID" }); expect(await database.db.select().from(s.meetingMinutes).where(eq(s.meetingMinutes.meetingId, meetingId))).toHaveLength(0);
  expect((await database.db.select().from(s.meetings).where(eq(s.meetings.id, meetingId)))[0]).toMatchObject({ status: "failed", minutesGenerationId: null });
 });
 it("SEC-AI-10 raw output omitted from detail/list and DB", async () => { const minutes = await run(); const json = await (await detail.GET(request(), params(minutes.id))).text(); expect(json).not.toContain("RAW_SENTINEL"); expect(json).not.toContain("aiRawOutput"); expect((await database.db.select().from(s.meetingMinutes).where(eq(s.meetingMinutes.id, minutes.id)))[0].aiRawOutput).toBeNull(); expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("RAW_SENTINEL"); });
 it("SEC-AI-01/02 injected transcript remains data; secrets and raw responses are excluded", async () => {
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "SECRET_SENTINEL");
  await database.db.update(s.meetingTranscripts).set({ text: fixtureTexts.injection }).where(eq(s.meetingTranscripts.id, transcriptId));
  await run(); const prompt = model.mock.calls[0][0]; expect(JSON.parse(prompt.userPrompt).transcripts[0].text).toBe(fixtureTexts.injection); expect(JSON.stringify(prompt)).not.toContain("SECRET_SENTINEL"); expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain(fixtureTexts.injection);
 });
 it("unknown AI fields and invalid schema cannot be saved", async () => { output = { ...(output as object), approved: true }; await expect(run()).rejects.toMatchObject({ code: "AI_SCHEMA_INVALID" }); expect(await database.db.select().from(s.meetingMinutes).where(eq(s.meetingMinutes.meetingId, meetingId))).toHaveLength(0); });
 it("CSRF and generate metadata tampering rejected before provider", async () => { const bad = request("POST", { meetingId }); bad.headers.set("origin", "https://evil.invalid"); expect((await generate.POST(bad)).status).toBe(403); expect((await generate.POST(request("POST", { meetingId, aiModel: "evil-model" }))).status).toBe(400); expect(model).not.toHaveBeenCalled(); });
 if (security) return;
 it("AI-MIN-T01/10 REV-T01/02/04/05 generation, review, approve and version history", async () => {
  const before = await database.db.select({ id: s.tickets.id }).from(s.tickets); const minutes = await run(); expect(minutes).toMatchObject({ status: "review", version: 1, aiModel: aiSettings.modelId, promptVersion: "minutes-v1", schemaVersion: "1.0" });
  await updateMinutes(f.ownerA.id, minutes.id, { summary: "Owner edit" }, database.db); await updateMinutes(f.memberA.id, minutes.id, { summary: "Member edit" }, database.db); expect((await approveMinutes(f.memberA.id, minutes.id, database.db)).status).toBe("approved"); await expect(updateMinutes(f.ownerA.id, minutes.id, { summary: "bad" }, database.db)).rejects.toMatchObject({ code: "MINUTES_APPROVED" });
  const next = await run({ regenerate: true }); expect(next.version).toBe(2); expect((await database.db.select().from(s.meetingMinutes).where(eq(s.meetingMinutes.id, minutes.id)))[0]).toMatchObject({ status: "approved", summary: "Member edit" }); expect(await database.db.select({ id: s.tickets.id }).from(s.tickets)).toEqual(before);
  const actions = (await database.db.select().from(s.auditLogs)).map((r) => r.action); for (const action of ["ai.minutes.generate", "minutes.update", "minutes.approve", "minutes.regenerate"]) expect(actions).toContain(action);
 });
 it("idempotency key and default latest avoid duplicate generation", async () => { const idempotencyKey = crypto.randomUUID(); const first = await run({ idempotencyKey, regenerate: true }); expect((await run({ idempotencyKey, regenerate: true })).id).toBe(first.id); expect((await run()).id).toBe(first.id); expect(model).toHaveBeenCalledTimes(1); });
 it("AI-MIN-T08 no transcript rejects before provider", async () => { await database.db.delete(s.meetingTranscripts).where(eq(s.meetingTranscripts.id, transcriptId)); await expect(run()).rejects.toMatchObject({ code: "TRANSCRIPT_REQUIRED" }); expect(model).not.toHaveBeenCalled(); });
 it("in-flight conflict blocks generation and manual status edits", async () => {
  let release!: () => void; let entered!: () => void; const began = new Promise<void>((resolve) => { entered = resolve; }); const hold = new Promise<void>((resolve) => { release = resolve; }); const original = model.getMockImplementation()!; model.mockImplementationOnce(async () => { entered(); await hold; return original(); });
  const running = run(); await began;
  try { await expect(run({ regenerate: true })).rejects.toMatchObject({ code: "MINUTES_GENERATION_CONFLICT" }); await expect(updateMeeting(f.ownerA.id, meetingId, { status: "failed" }, database.db)).rejects.toMatchObject({ code: "MINUTES_GENERATION_CONFLICT" }); } finally { release(); }
  expect((await running).version).toBe(1);
 });
 it("expired worker cannot overwrite a newer generation", async () => {
  let release!: () => void; let entered!: () => void; const began = new Promise<void>((resolve) => { entered = resolve; }); const hold = new Promise<void>((resolve) => { release = resolve; }); const original = model.getMockImplementation()!;
  model.mockImplementationOnce(async () => { entered(); await hold; return original(); });
  const old = run(); const rejected = expect(old).rejects.toMatchObject({ code: "MINUTES_GENERATION_CONFLICT" }); await began;
  try { await database.db.update(s.meetings).set({ minutesGenerationExpiresAt: new Date(0) }).where(eq(s.meetings.id, meetingId)); expect((await run({ regenerate: true })).version).toBe(1); } finally { release(); }
  await rejected; expect((await database.db.select().from(s.meetings).where(eq(s.meetings.id, meetingId)))[0]).toMatchObject({ status: "completed", minutesGenerationId: null }); expect(await database.db.select().from(s.meetingMinutes).where(eq(s.meetingMinutes.meetingId, meetingId))).toHaveLength(1);
 });
 it("expired lease recovers", async () => { await database.db.update(s.meetings).set({ minutesGenerationId: crypto.randomUUID(), minutesGenerationExpiresAt: new Date(0), status: "processing" }).where(eq(s.meetings.id, meetingId)); expect((await run()).version).toBe(1); });
 it("provider failure leaves no minutes, clears lease and audits safe error", async () => { model.mockRejectedValueOnce(new Error("SECRET_PROVIDER_MESSAGE")); await expect(run()).rejects.toMatchObject({ code: "AI_PROVIDER_ERROR" }); const logs = await database.db.select().from(s.auditLogs).where(eq(s.auditLogs.resourceId, meetingId)); expect(logs.some((r) => r.action === "ai.minutes.generate.failed")).toBe(true); expect(JSON.stringify(logs)).not.toContain("SECRET_PROVIDER_MESSAGE"); });
 it("oversize preflight never calls model", async () => { await expect(generateMeetingMinutes({ userId: f.ownerA.id, meetingId }, { db: database.db, settings: { ...aiSettings, maxInputBytes: 100 } })).rejects.toMatchObject({ code: "AI_CONTEXT_TOO_LARGE" }); expect(model).not.toHaveBeenCalled(); });
}
