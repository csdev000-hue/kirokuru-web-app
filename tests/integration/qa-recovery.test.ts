import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createTestDatabase, postgresBin, type TestDatabase } from "../helpers/postgres";
import { seedTestDatabase } from "../fixtures/db";
import { ticketCandidates, tickets, users } from "@/lib/db/schema";

const exec = promisify(execFile);
async function snapshot(context: TestDatabase) {
  const tables = await context.db.execute<{ table_schema: string; table_name: string }>(sql`
    SELECT table_schema, table_name FROM information_schema.tables
    WHERE table_schema IN ('public', 'drizzle') AND table_type = 'BASE TABLE'
    ORDER BY table_schema, table_name
  `);
  const data: Record<string, string[]> = {};
  for (const table of tables) {
    const rows = await context.db.execute<{ row: string }>(sql`
      SELECT to_jsonb(t)::text AS row FROM ${sql.identifier(table.table_schema)}.${sql.identifier(table.table_name)} t
    `);
    data[`${table.table_schema}.${table.table_name}`] = rows.map(r => r.row).sort();
  }
  return data;
}

it("QA-DR-01 isolated pg_dump/restore preserves all tables, migration history, links and constraints", async () => {
  // Poison ambient configuration: neither cluster nor pg tools may use it.
  vi.stubEnv("DATABASE_URL", "postgresql://unused@192.0.2.1/never-connect");
  const root = await mkdtemp("/tmp/kirokuru-recovery-");
  let source: TestDatabase | undefined;
  let target: TestDatabase | undefined;
  try {
    source = await createTestDatabase({ tls: true });
    await migrate(source.db, { migrationsFolder: "drizzle/migrations" });
    const f = await seedTestDatabase(source);
    await source.db.update(tickets).set({ sourceCandidateId: f.candidate.id }).where(eq(tickets.id, f.ticket.id));
    await source.db.update(ticketCandidates).set({ status: "registered", registeredTicketId: f.ticket.id }).where(eq(ticketCandidates.id, f.candidate.id));
    const before = await snapshot(source);
    expect(Object.keys(before)).toHaveLength(17); // 16 app tables + migration journal
    const bin = await postgresBin();
    const archive = join(root, "fixture.dump");
    // Explicit TLS loopback URLs and minimal environment exclude inherited PG settings/credentials.
    const pgEnv = (db: TestDatabase): NodeJS.ProcessEnv => ({ NODE_ENV: "test", PATH: process.env.PATH, PGSSLMODE: "verify-full", PGSSLROOTCERT: db.tls!.caPath });
    const pgUrl = (db: TestDatabase) => {
      const url = new URL(db.tls!.databaseUrl);
      // libpq 14 validates the certificate's DNS name; pin the actual address to loopback.
      url.hostname = "localhost";
      url.searchParams.set("hostaddr", "127.0.0.1");
      return url.toString();
    };
    const backupStart = performance.now();
    await exec(join(bin, "pg_dump"), ["--dbname", pgUrl(source), "--format=custom", "--no-owner", "--no-acl", "--file", archive], { env: pgEnv(source), timeout: 30000 });
    const backupMs = performance.now() - backupStart;
    // Writes after the snapshot must not silently appear in the restore (logical backup limitation).
    await source.db.insert(users).values({ email: "after-backup@example.invalid", name: "After backup" });
    const recoveryStart = performance.now();
    target = await createTestDatabase({ tls: true });
    expect(target.tls!.databaseUrl).not.toBe(source.tls!.databaseUrl);
    await exec(join(bin, "pg_restore"), ["--dbname", pgUrl(target), "--exit-on-error", "--single-transaction", "--no-owner", "--no-acl", archive], { env: pgEnv(target), timeout: 30000 });
    expect(await snapshot(target)).toEqual(before);
    await migrate(target.db, { migrationsFolder: "drizzle/migrations" });
    expect(await snapshot(target)).toEqual(before);
    const constraints = (db: TestDatabase) => db.db.execute(sql`
      SELECT n.nspname, t.relname, c.conname, c.contype, c.convalidated,
             c.condeferrable, c.condeferred, c.conkey, c.confkey, c.confupdtype, c.confdeltype, c.confmatchtype
      FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname IN ('public','drizzle') ORDER BY 1,2,3
    `);
    expect(Array.from(await constraints(target))).toEqual(Array.from(await constraints(source)));
    // pg_dump may reparse equivalent CHECK casts differently; exercise behavior as well as metadata.
    const rejectsCode = async (query: PromiseLike<unknown>, code: string) => {
      await expect(Promise.resolve(query).catch((error: unknown) => {
        throw error instanceof Error && error.cause ? error.cause : error;
      })).rejects.toMatchObject({ code });
    };
    await rejectsCode(target.db.insert(users).values({ email: f.ownerA.email, name: "Duplicate" }), "23505");
    await rejectsCode(target.db.execute(sql`UPDATE tickets SET status='invalid' WHERE id=${f.ticket.id}`), "23514");
    await rejectsCode(target.db.execute(sql`UPDATE tickets SET project_id='00000000-0000-0000-0000-000000000000' WHERE id=${f.ticket.id}`), "23503");
    expect(await snapshot(target)).toEqual(before);
    console.info("QA-DR-01", JSON.stringify({ scope: "local PostgreSQL fixtures only", tables: 17, backupMs: Math.round(backupMs), restoreAndVerifyMs: Math.round(performance.now() - recoveryStart), postBackupWritesRestored: false }));
  } finally {
    try { await target?.close(); } finally {
      try { await source?.close(); } finally { await rm(root, { recursive: true, force: true }); }
    }
  }
}, 120000);
