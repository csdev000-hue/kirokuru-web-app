import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { encode } from "next-auth/jwt";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createTestDatabase } from "./postgres";
import { seedTestDatabase } from "../fixtures/db";

// Only this local test process creates mock sessions. Nothing is imported by app/.
const database = await createTestDatabase({ tls: true });
try {
  await migrate(database.db, { migrationsFolder: "drizzle/migrations" });
  const fixture = await seedTestDatabase(database);
  const secret = randomBytes(48).toString("base64url");
  const token = await encode({ token: { appUserId: fixture.ownerA.id }, secret, salt: "authjs.session-token", maxAge: 600 });
  const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], {
    stdio: "inherit",
    env: {
      ...process.env, NODE_ENV: "production",
      DATABASE_URL: database.tls!.databaseUrl, NODE_EXTRA_CA_CERTS: database.tls!.caPath,
      AUTH_URL: "http://127.0.0.1:3100", AUTH_TRUST_HOST: "true", AUTH_SECRET: secret,
      AUTH_GOOGLE_ID: "local-e2e-client", AUTH_GOOGLE_SECRET: randomBytes(32).toString("hex"),
      E2E_SESSION_TOKEN: token,
    },
  });
  const stop = () => child.kill("SIGTERM");
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  process.exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  await database.close();
}
