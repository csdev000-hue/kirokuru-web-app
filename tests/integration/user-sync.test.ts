import { afterAll, beforeAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/lib/db/schema";
import { synchronizeUser } from "@/lib/auth/user-sync";
import { createTestDatabase, type TestDatabase } from "../helpers/postgres";
let context: TestDatabase;
beforeAll(async () => {
  context = await createTestDatabase();
  await migrate(context.db, { migrationsFolder: "drizzle/migrations" });
}, 120_000);
afterAll(async () => { if (context) await context.close(); }, 30_000);
it("検証済みProvider profileからアプリUUIDを作成", async () => {
  const user = await synchronizeUser({ email: "new@example.invalid", name: "New", emailVerified: true, avatarUrl: "https://example.invalid/avatar.png" }, context.db);
  expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(user.avatarUrl).toBe("https://example.invalid/avatar.png");
});
it("既存emailは同一UUIDを保ちプロフィール更新", async () => {
  const before = await synchronizeUser({ email: "existing@example.invalid", name: "Old", emailVerified: true }, context.db);
  const after = await synchronizeUser({ email: "EXISTING@example.invalid", name: "Updated", emailVerified: true }, context.db);
  expect(after.id).toBe(before.id);
  expect(after.name).toBe("Updated");
});
it("Providerの未提供name/avatarを上書きしない", async () => {
  const before = await synchronizeUser({ email: "preserve@example.invalid", name: "Preserved", emailVerified: true, avatarUrl: "https://example.invalid/a.png" }, context.db);
  const after = await synchronizeUser({ email: before.email, emailVerified: true }, context.db);
  expect(after.name).toBe(before.name);
  expect(after.avatarUrl).toBe(before.avatarUrl);
});
it("nameなしの新規Userを捏造しない", async () => {
  await expect(synchronizeUser({ email: "no-name@example.invalid", emailVerified: true }, context.db)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});
it.each([
  { email: "unverified@example.invalid", name: "User", emailVerified: false },
  { email: null, name: "User", emailVerified: true },
  { email: "invalid", name: "User", emailVerified: true },
  { email: "malicious@example.invalid", name: "User", emailVerified: true, role: "owner" },
  { email: "avatar@example.invalid", name: "User", emailVerified: true, avatarUrl: "javascript:alert(1)" },
])("不正なidentityを拒否: %#", async (profile) => {
  await expect(synchronizeUser(profile, context.db)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});
it("複数DB接続の初回同時ログインでもUserを1件にする", async () => {
  const base = context.db.$client.options;
  const client = postgres({ host: base.host[0], port: base.port[0], username: "postgres", database: base.database, ssl: false, max: 5, connect_timeout: 3 });
  try {
    const db = drizzle(client, { schema });
    const rows = await Promise.all(Array.from({ length: 10 }, () => synchronizeUser({ email: "race@example.invalid", name: "Concurrent", emailVerified: true }, db)));
    expect(new Set(rows.map((row) => row.id)).size).toBe(1);
    expect(await context.db.select().from(schema.users).where(eq(schema.users.email, "race@example.invalid"))).toHaveLength(1);
  } finally { await client.end({ timeout: 3 }); }
});
