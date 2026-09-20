import { beforeAll, afterAll, beforeEach, expect, it, vi } from "vitest";
import { sql, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { createTestDatabase, type TestDatabase } from "../helpers/postgres";
import { seedTestDatabase, type DatabaseFixture } from "../fixtures/db";
vi.mock("@/lib/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: vi.fn() }));
import { getDb } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { databaseRateLimiter, enforceLimit, apiRatePolicy } from "@/lib/security/rate-limit";
import { limitAIResource } from "@/lib/security/ai-rate-limit";
import { limitAuthentication } from "@/lib/security/auth-rate-limit";
import { withCurrentUser } from "@/lib/auth/api";
import { rateLimits, auditLogs } from "@/lib/db/schema";
import { POST as createOrganization } from "@/app/api/organizations/route";
import { POST as minutes } from "@/app/api/ai/generate-minutes/route";
import { POST as candidates } from "@/app/api/ai/generate-tickets/route";
import { POST as upload } from "@/app/api/meetings/[id]/recordings/upload-url/route";
import { POST as download } from "@/app/api/recordings/[id]/download-url/route";
import { POST as token } from "@/app/api/meetings/[id]/token/route";
import { POST as start } from "@/app/api/meetings/[id]/start/route";
import { POST as end } from "@/app/api/meetings/[id]/end/route";
import { POST as register } from "@/app/api/ticket-candidates/[id]/register/route";
import { POST as bulk } from "@/app/api/ticket-candidates/bulk-register/route";
let context: TestDatabase; let f: DatabaseFixture;
const request = (path: string, body: unknown = {}) => new Request(`http://localhost:3100${path}`, { method: "POST", headers: { origin: "http://localhost:3100", "Content-Type": "application/json", "X-Request-Id": "attacker-controlled" }, body: JSON.stringify(body) });
beforeAll(async () => { context = await createTestDatabase(); await migrate(context.db, { migrationsFolder: "drizzle/migrations" }); f = await seedTestDatabase(context); }, 120000);
afterAll(async () => { if (context) await context.close(); }, 30000);
beforeEach(async () => {
  vi.mocked(getDb).mockReturnValue(context.db); vi.mocked(requireCurrentUser).mockResolvedValue(f.ownerA);
  vi.stubEnv("AUTH_URL", "http://localhost:3100"); vi.stubEnv("LIVE_MEETING_ENABLED", "true");
  vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {});
  await context.db.delete(rateLimits);
});
it("SEC-RATE DB atomic counter across connections, bounded and resettable", async () => {
  const options = context.db.$client.options;
  const client = postgres({ host: options.host[0], port: options.port[0], database: options.database, username: "postgres", max: 8 });
  try {
    const limiter = databaseRateLimiter(drizzle(client));
    const results = await Promise.all(Array.from({ length: 30 }, () => limiter.check({ key: "concurrency", limit: 5, windowSeconds: 60 })));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(results.every((r) => r.remaining >= 0 && r.retryAfterSeconds > 0)).toBe(true);
    const [row] = await context.db.select().from(rateLimits); expect(row.hits).toBe(6); expect(row.key).not.toContain("concurrency");
    await context.db.update(rateLimits).set({ expiresAt: new Date(0) });
    expect((await limiter.check({ key: "concurrency", limit: 5, windowSeconds: 60 })).allowed).toBe(true);
  } finally { await client.end(); }
});
it.each([
  ["AI minutes", "/api/ai/generate-minutes", minutes, "RATE_LIMIT_AI_PER_MINUTE"],
  ["AI candidate", "/api/ai/generate-tickets", candidates, "RATE_LIMIT_AI_PER_MINUTE"],
  ["S3 upload", "/api/meetings/invalid/recordings/upload-url", upload, "RATE_LIMIT_PRESIGNED_URL_PER_MINUTE"],
  ["S3 download", "/api/recordings/invalid/download-url", download, "RATE_LIMIT_PRESIGNED_URL_PER_MINUTE"],
  ["LiveKit token", "/api/meetings/invalid/token", token, "RATE_LIMIT_TOKEN_PER_MINUTE"],
  ["Meeting start", "/api/meetings/invalid/start", start, "RATE_LIMIT_TOKEN_PER_MINUTE"],
  ["Meeting end", "/api/meetings/invalid/end", end, "RATE_LIMIT_TOKEN_PER_MINUTE"],
  ["Register", "/api/ticket-candidates/invalid/register", register, "RATE_LIMIT_REGISTRATION_PER_MINUTE"],
  ["Bulk register", "/api/ticket-candidates/bulk-register", bulk, "RATE_LIMIT_REGISTRATION_PER_MINUTE"],
] as const)("SEC-RATE %s rejects failed repeated attempts with 429/Retry-After", async (_name, path, handler, env) => {
  vi.stubEnv(env, "1");
  const params = { params: Promise.resolve({ id: "invalid" }) };
  expect((await handler(request(path), params)).status).not.toBe(429);
  const response = await handler(request(path), params);
  expect(response.status).toBe(429); expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
  expect(await response.json()).toMatchObject({ error: { code: "RATE_LIMIT_EXCEEDED" }, requestId: response.headers.get("X-Request-Id") });
});
it("SEC-RATE AI project/resource limits follow DB authorization and do not disclose tenant", async () => {
  vi.stubEnv("RATE_LIMIT_AI_RESOURCE_PER_MINUTE", "1");
  await expect(limitAIResource(f.ownerA.id, f.meetingB.id)).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  expect(await context.db.select().from(rateLimits)).toHaveLength(0);
  await limitAIResource(f.ownerA.id, f.meetingA.id);
  await expect(limitAIResource(f.ownerA.id, f.meetingA.id)).rejects.toMatchObject({ code: "RATE_LIMIT_EXCEEDED" });
});
it("SEC-RATE OAuth entry shares persistent budget", async () => {
  vi.stubEnv("RATE_LIMIT_AUTH_PER_MINUTE", "1"); await limitAuthentication();
  await expect(limitAuthentication()).rejects.toMatchObject({ code: "RATE_LIMIT_EXCEEDED", status: 429 });
});
it("SEC-RATE user isolation and fail closed storage failure", async () => {
  await enforceLimit("user:a", 1); await enforceLimit("user:b", 1);
  await expect(enforceLimit("user:a", 1)).rejects.toMatchObject({ status: 429 });
  const handler = vi.fn(); vi.mocked(getDb).mockReturnValue({ execute: () => Promise.reject(new Error("PRIVATE_DB")) } as unknown as ReturnType<typeof getDb>);
  const response = await withCurrentUser(handler)(request("/api/ai/generate-minutes"));
  expect(response.status).toBe(500); expect(handler).not.toHaveBeenCalled(); expect(await response.text()).not.toContain("PRIVATE_DB");
});
it("REQ-T01/T04 and AUD: response, logs and transactional audit share server ID", async () => {
  const response = await createOrganization(request("/api/organizations", { name: "Correlation test" }));
  expect(response.status).toBe(201);
  const result = await response.json(); const requestId = response.headers.get("X-Request-Id");
  expect(result.requestId).toBe(requestId); expect(requestId).not.toBe("attacker-controlled");
  const [audit] = await context.db.select().from(auditLogs).where(eq(auditLogs.resourceId, result.data.id));
  expect(audit.metadata?.requestId).toBe(requestId);
  expect(vi.mocked(console.info).mock.calls.map(([value]) => JSON.parse(value)).some((entry) => entry.requestId === requestId)).toBe(true);
});
it("REQ-T02/03 safe validation/DB errors keep envelope and request ID", async () => {
  for (const error of [{ cause: { code: "23505", detail: "PRIVATE_SQL" } }, new Error("PRIVATE_STACK")]) {
    const response = await withCurrentUser(() => { throw error; })();
    const value = await response.json(); expect(value.requestId).toBe(response.headers.get("X-Request-Id")); expect(JSON.stringify(value)).not.toContain("PRIVATE_");
    expect(response.status).toBe(error instanceof Error ? 500 : 409);
  }
  const validation = await createOrganization(request("/api/organizations", { name: "n", role: "owner" }));
  expect(validation.status).toBe(400); expect(await validation.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" }, requestId: expect.any(String) });
});
it("SEC-FLAG AI disabled isolates provider operations from CRUD", async () => {
  vi.stubEnv("AI_ENABLED", "false"); const handler = vi.fn();
  expect((await withCurrentUser(handler)(request("/api/ai/generate-minutes"))).status).toBe(503); expect(handler).not.toHaveBeenCalled();
  expect((await createOrganization(request("/api/organizations", { name: "Still available" }))).status).toBe(201);
});
it("SEC-FLAG recording disabled preserves cleanup", async () => {
  vi.stubEnv("RECORDING_ENABLED", "false");
  expect((await withCurrentUser(() => Response.json({ data: true }))(request("/api/recordings/x/download-url"))).status).toBe(503);
  const cleanup = new Request("http://localhost:3100/api/recordings/x", { method: "DELETE", headers: { origin: "http://localhost:3100" } });
  expect((await withCurrentUser(() => new Response(null, { status: 204 }))(cleanup)).status).toBe(204);
});
it("costly policy cannot fall through to CRUD", () => {
  expect(apiRatePolicy("/api/meetings/id/token").group).toBe("live");
  expect(apiRatePolicy("/api/meetings/id/%74oken/").group).toBe("live");
  expect(apiRatePolicy("/api/%61i/generate-minutes").group).toBe("ai");
});
it("fixed-window rows reuse existing keys instead of growing each minute", async () => {
  for (let i = 0; i < 3; i++) { await enforceLimit("reuse", 2); await context.db.execute(sql`UPDATE rate_limits SET expires_at = now() - interval '1 second'`); }
  expect(await context.db.select().from(rateLimits)).toHaveLength(1);
});
