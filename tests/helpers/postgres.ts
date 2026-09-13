import { execFile } from "node:child_process";
import { access, mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../../lib/db/schema";

const exec = promisify(execFile);
const testDatabases = new WeakSet<object>();

export function assertTestDatabase(context: object) {
  if (process.env.NODE_ENV !== "test" || !testDatabases.has(context)) {
    throw new Error("Fixtures require an isolated database created by the test harness.");
  }
}

async function postgresBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  try {
    return (await exec("pg_config", ["--bindir"])).stdout.trim();
  } catch {
    const macBin = "/Library/PostgreSQL/14/bin";
    await access(join(macBin, "initdb"));
    return macBin;
  }
}

/** Always creates a private Unix-socket-only cluster; never reads DATABASE_URL. */
export async function createTestDatabase() {
  if (process.env.NODE_ENV !== "test") throw new Error("Test databases can only start in NODE_ENV=test.");
  const bin = await postgresBin();
  // Keep the Unix socket path below PostgreSQL's path length limit on macOS.
  const root = await mkdtemp("/tmp/kirokuru-db-");
  const data = join(root, "data");
  const socket = join(root, "socket");
  await mkdir(socket, { mode: 0o700 });
  let started = false;
  const stop = async () => {
    if (started) {
      await exec(join(bin, "pg_ctl"), ["-D", data, "-m", "immediate", "-w", "stop"]);
      started = false;
    }
    await rm(root, { recursive: true, force: true });
  };
  try {
    await exec(join(bin, "initdb"), ["-D", data, "-A", "trust", "-U", "postgres", "--no-locale", "--encoding=UTF8"]);
    await exec(join(bin, "pg_ctl"), ["-D", data, "-l", join(root, "postgres.log"), "-o", `-k ${socket} -h '' -p 5432 -F`, "-w", "start"]);
    started = true;
    const options = { host: socket, port: 5432, username: "postgres", ssl: false as const, max: 1, onnotice: () => {}, connection: { timezone: "UTC" } };
    const admin = postgres({ ...options, database: "postgres" });
    try { await admin`CREATE DATABASE kirokuru_test`; } finally { await admin.end(); }
    const client = postgres({ ...options, database: "kirokuru_test" });
    const db = drizzle(client, { schema });
    const context = {
      db,
      async close() {
        testDatabases.delete(context);
        try { await client.end({ timeout: 5 }); } finally { await stop(); }
      },
    };
    testDatabases.add(context);
    return context;
  } catch (error) {
    await stop();
    throw error;
  }
}
export type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;
