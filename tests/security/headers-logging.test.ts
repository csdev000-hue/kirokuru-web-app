import { expect, it, vi } from "vitest";
import { securityHeaders } from "@/lib/security/security-headers";
import { redact } from "@/lib/logging/redaction";
import { logEvent } from "@/lib/logging/logger";
import { requestContext } from "@/lib/logging/context";
import { databaseError, ApplicationError } from "@/lib/errors/application-error";
import { errorResponse } from "@/lib/errors/error-response";
import { forbiddenPublicKeys, secretPatterns } from "@/lib/security/secret-inspection";
import { apiErrorMessage } from "@/lib/api/client-error";
it("SEC-HDR-01..05 strict script CSP and provider origins without global wildcards", () => {
  const headers = securityHeaders("nonce-value", "/meetings/id/live", { NODE_ENV: "production", AUTH_URL: "https://app.example.invalid", LIVEKIT_URL: "wss://meeting.example.invalid", AWS_REGION: "ap-northeast-1", S3_BUCKET_NAME: "private-recordings" });
  const csp = headers["Content-Security-Policy"];
  expect(csp).toContain("'nonce-nonce-value'"); expect(csp).toContain("'strict-dynamic'"); expect(csp).not.toContain("unsafe-eval");
  expect(csp).toContain("wss://meeting.example.invalid"); expect(csp).toContain("https://meeting.example.invalid"); expect(csp).toContain("https://private-recordings.s3.ap-northeast-1.amazonaws.com");
  expect(csp).toContain("frame-ancestors 'none'"); expect(csp).not.toMatch(/(?:default|connect|script)-src \*/);
  expect(headers).toMatchObject({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Strict-Transport-Security": "max-age=31536000" });
  expect(headers["Permissions-Policy"]).toContain("camera=(self)");
  expect(securityHeaders("n", "/", { NODE_ENV: "production", AUTH_URL: "http://localhost:3100" })).not.toHaveProperty("Strict-Transport-Security");
  expect(securityHeaders("n", "/", {})["Permissions-Policy"]).toContain("camera=()");
});
it.each(["https://user:password@provider.invalid", "http://remote.invalid", "https://provider.invalid/?secret=value"])("SEC-HDR rejects unsafe provider configuration %s", (url) => { expect(() => securityHeaders("n", "/", { LIVEKIT_URL: url })).toThrow(); });
it("SEC-SECRET-04 nested case-insensitive redaction and newline-safe structured logs", () => {
  const capture = vi.spyOn(console, "warn").mockImplementation(() => {});
  const value = redact({ PaSsWoRd: "sensitive", list: [{ API_SECRET: "sensitive", presignedUrl: "sensitive" }], error: new Error("sensitive"), url: "https://storage.invalid/?signature=sensitive" });
  expect(JSON.stringify(value)).not.toContain("sensitive");
  logEvent({ event: "security", operation: "auth\nforged", password: "sensitive", rawOutput: "sensitive" }, "warn");
  const line = capture.mock.calls[0][0]; expect(line.split("\n")).toHaveLength(1); expect(JSON.parse(line)).toMatchObject({ level: "warn", operation: "auth\nforged", timestamp: expect.any(String) }); expect(line).not.toContain("sensitive");
});
it("REQ concurrent async contexts cannot overwrite another request", async () => {
  const capture = vi.spyOn(console, "info").mockImplementation(() => {});
  await Promise.all(["a", "b"].map((requestId) => requestContext.run({ requestId }, async () => { await Promise.resolve(); logEvent({ event: requestId }); })));
  for (const [line] of capture.mock.calls) { const row = JSON.parse(line); expect(row.requestId).toBe(row.event); }
});
it.each(["23505", "23503", "23514", "40001", "40P01", "08006", "57P01", "ECONNREFUSED"])("ERR DB %s mapped without SQL/driver leakage", async (code) => {
  const error = { cause: { code, message: "PRIVATE_SQL" } }; expect(databaseError(error)).toBeInstanceOf(ApplicationError);
  const response = errorResponse(error, crypto.randomUUID()); expect(response.status).toBe(code.startsWith("23") || code.startsWith("40") ? 409 : 503); expect(await response.text()).not.toContain("PRIVATE_SQL");
});
it("ERR expose false never returns internal message", async () => { const response = errorResponse(new ApplicationError("INTERNAL_ERROR", 500, "PRIVATE_STACK", false), crypto.randomUUID()); expect(await response.text()).not.toContain("PRIVATE_STACK"); });
it("SEC-SECRET source detectors and forbidden public keys", () => {
  expect(secretPatterns("AKIA" + "A".repeat(16))).toContain("aws-access-key");
  expect(secretPatterns("-----BEGIN " + "PRIVATE KEY-----")).toContain("private-key");
  expect(forbiddenPublicKeys({ NEXT_PUBLIC_APP_URL: "https://example.invalid", ["NEXT_PUBLIC_" + "AUTH_SECRET"]: "x" })).toEqual(["NEXT_PUBLIC_" + "AUTH_SECRET"]);
});
it("429 and 500 UI includes safe correlation/retry guidance", () => {
  const id = crypto.randomUUID();
  expect(apiErrorMessage(new Response(null, { status: 429, headers: { "Retry-After": "12" } }), { requestId: id }, "fallback")).toContain("12秒後");
  expect(apiErrorMessage(new Response(null, { status: 500 }), { requestId: id }, "PRIVATE_SQL")).toContain(id);
  expect(apiErrorMessage(new Response(null, { status: 500 }), {}, "PRIVATE_SQL")).not.toContain("PRIVATE_SQL");
});
