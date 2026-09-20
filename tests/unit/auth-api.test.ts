import { beforeEach, expect, it, vi } from "vitest";
import { AccessError } from "@/lib/permissions/errors";
const currentUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: currentUser }));
import { withCurrentUser } from "@/lib/auth/api";
beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => {}); });
it.each([ ["UNAUTHENTICATED", 401], ["FORBIDDEN", 403], ["RESOURCE_NOT_FOUND", 404] ] as const)("共通APIの%sをHTTP %iへ変換", async (code, status) => {
  currentUser.mockRejectedValue(new AccessError(code));
  const handler = vi.fn();
  const response = await withCurrentUser(handler)();
  expect(response.status).toBe(status);
  expect((await response.json()).error.code).toBe(code);
  expect(handler).not.toHaveBeenCalled();
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("DB/Providerの生エラーを応答・ログに出さない", async () => {
  currentUser.mockRejectedValue(new Error("secret-unit-test SELECT provider_token stack"));
  const response = await withCurrentUser(() => Response.json({}))();
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("secret-unit-test");
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("secret-unit-test");
});
it("認証済みUserをhandlerに渡す", async () => {
  const user = { id: crypto.randomUUID(), email: "test@example.invalid", name: "Test" };
  currentUser.mockResolvedValue(user);
  const response = await withCurrentUser((value) => Response.json({ data: value }))();
  expect(await response.json()).toEqual({ data: user, requestId: response.headers.get("x-request-id") });
  expect(response.headers.get("x-request-id")).toBeTruthy();
});
