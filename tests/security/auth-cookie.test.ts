import { beforeEach, expect, it, vi } from "vitest";
import { Auth } from "@auth/core";
import { encode } from "@auth/core/jwt";
// Next.js integration is exercised by E2E; use the real Auth.js core here for HTTPS cookies.
vi.mock("next-auth", () => ({ default: () => ({}) }));
import { createAuthConfig } from "@/lib/auth/config";
const secret = "unit-test-secret-only-no-real-credential";
beforeEach(() => {
  vi.stubEnv("AUTH_URL", "https://secure.example.invalid"); vi.stubEnv("AUTH_SECRET", secret);
  vi.stubEnv("AUTH_GOOGLE_ID", "unit-test-google"); vi.stubEnv("AUTH_GOOGLE_SECRET", "unit-test-google-secret"); vi.stubEnv("AUTH_TRUST_HOST", "true");
});
it("SEC-AUTH-03 HTTPS session refresh preserves Secure/HttpOnly/SameSite", async () => {
  const salt = "__Secure-authjs.session-token";
  const token = await encode({ token: { appUserId: crypto.randomUUID() }, salt, secret, maxAge: 60 });
  const response = await Auth(new Request("https://secure.example.invalid/api/auth/session", { headers: { cookie: `${salt}=${token}` } }), { ...createAuthConfig(), basePath: "/api/auth" });
  expect(response.status).toBe(200);
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith(salt + "="));
  expect(cookie).toContain("Secure"); expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("SameSite=Lax");
  expect(await response.json()).toMatchObject({ appUserId: expect.any(String) });
});
it("SEC-AUTH-03 HTTPS CSRF cookie retains Host prefix", async () => {
  const response = await Auth(new Request("https://secure.example.invalid/api/auth/csrf"), { ...createAuthConfig(), basePath: "/api/auth" });
  expect(response.status).toBe(200);
  const csrf = response.headers.getSetCookie().find((value) => value.startsWith("__Host-authjs.csrf-token="));
  expect(csrf).toContain("Secure"); expect(csrf).toContain("HttpOnly"); expect(csrf).toContain("SameSite=Lax");
  expect(await response.json()).toHaveProperty("csrfToken");
});
