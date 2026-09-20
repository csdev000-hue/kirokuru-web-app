import { startLiveKitServer } from "./livekit-server";
import { startS3Server } from "./s3-server";
import { startBedrockServer } from "./bedrock-server";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { encode } from "next-auth/jwt";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createTestDatabase } from "./postgres";
import { seedTestDatabase } from "../fixtures/db";

// Only this local test process creates mock sessions. Nothing is imported by app/.
const database = await createTestDatabase({ tls: true });
let livekit: Awaited<ReturnType<typeof startLiveKitServer>> | undefined;
let s3: Awaited<ReturnType<typeof startS3Server>> | undefined;
let bedrock: Awaited<ReturnType<typeof startBedrockServer>> | undefined;
try {
  livekit = await startLiveKitServer();
  s3 = await startS3Server();
  bedrock = await startBedrockServer();
  await migrate(database.db, { migrationsFolder: "drizzle/migrations" });
  const fixture = await seedTestDatabase(database);
  const secret = randomBytes(48).toString("base64url");
  const token = await encode({ token: { appUserId: fixture.ownerA.id }, secret, salt: "authjs.session-token", maxAge: 600 });
  const viewerToken = await encode({ token: { appUserId: fixture.viewerA.id }, secret, salt: "authjs.session-token", maxAge: 600 });
  const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], {
    stdio: "inherit",
    env: {
      ...process.env, NODE_ENV: "production",
      DATABASE_URL: database.tls!.databaseUrl, NODE_EXTRA_CA_CERTS: database.tls!.caPath,
      AUTH_URL: "http://127.0.0.1:3100", AUTH_TRUST_HOST: "true", AUTH_SECRET: secret,
      AUTH_GOOGLE_ID: "local-e2e-client", AUTH_GOOGLE_SECRET: randomBytes(32).toString("hex"),
      E2E_SESSION_TOKEN: token, E2E_VIEWER_SESSION_TOKEN: viewerToken, E2E_LIVE_PROJECT_ID: fixture.projectA.id,
      LIVE_MEETING_ENABLED: "true", LIVEKIT_URL: livekit.endpoint, LIVEKIT_API_KEY: livekit.apiKey, LIVEKIT_API_SECRET: livekit.apiSecret, E2E_LIVEKIT_ENDPOINT: livekit.endpoint,
      AWS_ENDPOINT_URL_S3: s3.endpoint, S3_BUCKET_NAME: "local-recordings-test",
      AWS_ENDPOINT_URL_BEDROCK_RUNTIME: bedrock.endpoint, AWS_REGION: "ap-northeast-1", BEDROCK_MODEL_ID: "local-e2e-model", AWS_ACCESS_KEY_ID: "local-test", AWS_SECRET_ACCESS_KEY: "local-test", AWS_SESSION_TOKEN: "", AWS_EC2_METADATA_DISABLED: "true",
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
  await livekit?.close();
  await s3?.close();
  await bedrock?.close();
  await database.close();
}
