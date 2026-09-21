import { execFile } from "node:child_process";
import { access, mkdtemp, mkdir, rm, writeFile, chmod } from "node:fs/promises";
import { createServer } from "node:net";
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

export async function postgresBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  try {
    return (await exec("pg_config", ["--bindir"])).stdout.trim();
  } catch {
    const macBin = "/Library/PostgreSQL/14/bin";
    await access(join(macBin, "initdb"));
    return macBin;
  }
}

/** Creates an isolated local cluster. TLS loopback is opt-in for E2E; never reads DATABASE_URL. */
export async function createTestDatabase(options?: { tls?: boolean }) {
  if (process.env.NODE_ENV !== "test") throw new Error("Test databases can only start in NODE_ENV=test.");
  const bin = await postgresBin();
  // Keep the Unix socket path below PostgreSQL's path length limit on macOS.
  const root = await mkdtemp("/tmp/kirokuru-db-");
  const data = join(root, "data");
  const socket = join(root, "socket");
  await mkdir(socket, { mode: 0o700 });
  let started = false;
  let tls: { databaseUrl: string; caPath: string } | undefined;
  const stop = async () => {
    if (started) {
      await exec(join(bin, "pg_ctl"), ["-D", data, "-m", "immediate", "-w", "stop"]);
      started = false;
    }
    await rm(root, { recursive: true, force: true });
  };
  try {
    await exec(join(bin, "initdb"), ["-D", data, "-A", "trust", "-U", "postgres", "--no-locale", "--encoding=UTF8"]);
    let port = 5432;
    let serverOptions = `-k ${socket} -h '' -p ${port} -F`;
    if (options?.tls) {
      port = await new Promise<number>((resolve, reject) => {
        const server = createServer();
        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          if (!address || typeof address === "string") return reject(new Error("No test port"));
          server.close(() => resolve(address.port));
        });
      });
      const key = join(root, "server.key");
      const cert = join(root, "server.crt");
      const config = join(root, "openssl.cnf");
      await writeFile(config, "[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=IP:127.0.0.1,DNS:localhost\nbasicConstraints=critical,CA:TRUE\n");
      await exec("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-config", config]);
      await chmod(key, 0o600);
      serverOptions = `-k ${socket} -h 127.0.0.1 -p ${port} -F -c ssl=on -c ssl_cert_file=${cert} -c ssl_key_file=${key}`;
      tls = { databaseUrl: `postgresql://postgres@127.0.0.1:${port}/kirokuru_test`, caPath: cert };
    }
    await exec(join(bin, "pg_ctl"), ["-D", data, "-l", join(root, "postgres.log"), "-o", serverOptions, "-w", "start"]);
    started = true;
    const clientOptions = { host: socket, port, username: "postgres", ssl: false as const, max: 1, onnotice: () => {}, connection: { timezone: "UTC" } };
    const admin = postgres({ ...clientOptions, database: "postgres" });
    try { await admin`CREATE DATABASE kirokuru_test`; } finally { await admin.end(); }
    const client = postgres({ ...clientOptions, database: "kirokuru_test" });
    const db = drizzle(client, { schema });
    const context = {
      db,
      tls,
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
