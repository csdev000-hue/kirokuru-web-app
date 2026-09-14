import { beforeEach, expect, it, vi } from "vitest";
import { safeAuthRedirect } from "@/lib/auth/redirect";
import { getAuthSettings } from "@/lib/auth/settings";
const sync = vi.hoisted(() => vi.fn());
// Unit tests exercise our callbacks; the Next.js/Auth.js runtime is covered by E2E.
vi.mock("next-auth", () => ({ default: () => ({}) }));
vi.mock("@/lib/auth/user-sync", () => ({ synchronizeUser: sync }));
import { createAuthConfig } from "@/lib/auth/config";
const setSettings = () => {
  vi.stubEnv("AUTH_SECRET", "test-only-not-a-production-secret-00000");
  vi.stubEnv("AUTH_GOOGLE_ID", "test-client");
  vi.stubEnv("AUTH_GOOGLE_SECRET", "test-only-provider-placeholder");
  vi.stubEnv("AUTH_TRUST_HOST", "true");
  vi.stubEnv("AUTH_URL", "https://app.example.invalid");
};
beforeEach(setSettings);
it("Secret未設定でもconfig構築可能、ログインは利用不可", () => {
  vi.stubEnv("AUTH_SECRET", "");
  expect(getAuthSettings()).toBeNull();
  expect(createAuthConfig().providers).toEqual([]);
});
it("AUTH_TRUST_HOST=falseをtruthyとして扱わない", () => {
  vi.stubEnv("AUTH_TRUST_HOST", "false");
  expect(createAuthConfig().trustHost).toBe(false);
});
it.each(["http://app.example.invalid", "https://user:password@app.example.invalid", "https://app.example.invalid/path"])("安全でないAUTH_URLを拒否: %s", (url) => {
  vi.stubEnv("AUTH_URL", url);
  expect(getAuthSettings()).toBeNull();
});
it.each(["https://evil.example", "//evil.example", "/\\evil.example", "https://app.example.invalid.evil.example/login", "/api/auth/signout", "javascript:alert(1)"])("外部/未許可redirectを拒否: %s", (url) => {
  expect(safeAuthRedirect(url, "https://app.example.invalid")).toBe("https://app.example.invalid/dashboard");
});
it("Login/Logout redirectを同一Originの固定Pathに限定", () => {
  expect(safeAuthRedirect("/login?callbackUrl=https://evil.example", "https://app.example.invalid")).toBe("https://app.example.invalid/login");
  expect(safeAuthRedirect("/dashboard", "https://app.example.invalid")).toBe("https://app.example.invalid/dashboard");
});
it("Cookie/CSRF機構を上書きしない", () => {
  const config = createAuthConfig();
  expect(config.cookies).toBeUndefined();
  expect(config.skipCSRFCheck).toBeUndefined();
  expect(config.session).toEqual({ strategy: "jwt", maxAge: 3600 });
});
it("未検証EmailのGoogle認証を拒否", async () => {
  const config = createAuthConfig();
  expect(await config.callbacks!.signIn!({ user: { id: "external" }, account: { provider: "google", providerAccountId: "external", type: "oidc" }, profile: { email: "test@example.invalid", email_verified: false } })).toBe(false);
  expect(sync).not.toHaveBeenCalled();
});
it("検証済みGoogle認証はアプリUUIDのみをJWTへ格納", async () => {
  const id = crypto.randomUUID();
  sync.mockResolvedValue({ id });
  const config = createAuthConfig();
  const token = await config.callbacks!.jwt!({
    token: { sub: "external", access_token: "do-not-store" }, user: { id: "external" },
    account: { provider: "google", providerAccountId: "external", type: "oidc", access_token: "do-not-store" },
    profile: { email: "test@example.invalid", email_verified: true, name: "Test" }, trigger: "signIn",
  });
  expect(token).toEqual({ appUserId: id });
});
it("ClientからのSession updateでrole/User IDを変更できない", async () => {
  const id = crypto.randomUUID();
  const config = createAuthConfig();
  const token = await config.callbacks!.jwt!({ token: { appUserId: id }, user: { id }, trigger: "update", session: { appUserId: crypto.randomUUID(), role: "owner" } });
  expect(token).toEqual({ appUserId: id });
});
