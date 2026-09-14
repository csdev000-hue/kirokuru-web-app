import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), getDb: vi.fn(), rows: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getApplicationSession: mocks.session }));
vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
import { getCurrentUser, requireCurrentUser } from "@/lib/auth/current-user";
beforeEach(() => {
  mocks.getDb.mockReturnValue({ select: () => ({ from: () => ({ where: () => ({ limit: mocks.rows }) }) }) });
});
it.each([null, { appUserId: "provider-id" }, { user: { id: crypto.randomUUID(), role: "owner" } }])("未認証/Provider IDをアプリUserとして扱わない %#", async (session) => {
  mocks.session.mockResolvedValue(session);
  expect(await getCurrentUser()).toBeNull();
  expect(mocks.getDb).not.toHaveBeenCalled();
  await expect(requireCurrentUser()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});
it("SessionのUUIDから実在するDB Userだけを取得", async () => {
  const user = { id: crypto.randomUUID(), name: "DB Name", email: "db@example.invalid" };
  mocks.session.mockResolvedValue({ appUserId: user.id, name: "forged", role: "owner" });
  mocks.rows.mockResolvedValue([user]);
  expect(await requireCurrentUser()).toEqual(user);
});
it("Sessionが残っても削除済みUserは認証しない", async () => {
  mocks.session.mockResolvedValue({ appUserId: crypto.randomUUID() });
  mocks.rows.mockResolvedValue([]);
  expect(await getCurrentUser()).toBeNull();
});
