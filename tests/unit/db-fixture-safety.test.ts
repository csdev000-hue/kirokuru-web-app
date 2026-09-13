import { expect, it, vi } from "vitest";
import { assertTestDatabase, createTestDatabase } from "../helpers/postgres";

it("任意のDB接続をFixture対象として受け付けない", () => {
  expect(() => assertTestDatabase({})).toThrow("isolated database");
});
it("Production環境では一時DB作成もFixtureも拒否する", async () => {
  vi.stubEnv("NODE_ENV", "production");
  await expect(createTestDatabase()).rejects.toThrow("NODE_ENV=test");
  expect(() => assertTestDatabase({})).toThrow("isolated database");
});
