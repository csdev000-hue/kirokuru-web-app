import { startLiveKitServer } from "./livekit-server";
import { startS3Server } from "./s3-server";
import { startBedrockServer } from "./bedrock-server";
import { spawn } from "node:child_process";
import { users, rateLimits } from "../../lib/db/schema";
import { randomBytes, createHash } from "node:crypto";
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
  const [limitedUser] = await database.db.insert(users).values({email:"rate-fixture@example.invalid",name:"Rate fixture"}).returning();
  await database.db.insert(rateLimits).values(["ai","presigned","live"].map(group=>({key:createHash("sha256").update(`${group}:user:${limitedUser.id}`).digest("hex"),hits:100,expiresAt:new Date(Date.now()+900000)})));
  const limitedToken=await encode({token:{appUserId:limitedUser.id},secret,salt:"authjs.session-token",maxAge:600});
  const token = await encode({ token: { appUserId: fixture.ownerA.id }, secret, salt: "authjs.session-token", maxAge: 600 });
  const memberToken = await encode({token:{appUserId:fixture.memberA.id},secret,salt:"authjs.session-token",maxAge:600});
  const otherToken = await encode({token:{appUserId:fixture.ownerB.id},secret,salt:"authjs.session-token",maxAge:600});
  const viewerToken = await encode({ token: { appUserId: fixture.viewerA.id }, secret, salt: "authjs.session-token", maxAge: 600 });
  const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], {
    stdio: "inherit",
    env: {
      ...process.env, NODE_ENV: "production",
      AI_ENABLED: "true", RECORDING_ENABLED: "true",
      RATE_LIMIT_AI_PER_MINUTE: "100", RATE_LIMIT_API_PER_MINUTE: "3000",
      RATE_LIMIT_AUTH_PER_MINUTE: "1000", RATE_LIMIT_TOKEN_PER_MINUTE: "100", RATE_LIMIT_PRESIGNED_URL_PER_MINUTE: "100",
      RATE_LIMIT_AI_PROJECT_PER_MINUTE: "100", RATE_LIMIT_AI_RESOURCE_PER_MINUTE: "20",
      DATABASE_URL: database.tls!.databaseUrl, NODE_EXTRA_CA_CERTS: database.tls!.caPath,
      AUTH_URL: "http://127.0.0.1:3100", AUTH_TRUST_HOST: "true", AUTH_SECRET: secret,
      AUTH_GOOGLE_ID: "local-e2e-client", AUTH_GOOGLE_SECRET: randomBytes(32).toString("hex"),
      E2E_SESSION_TOKEN: token, E2E_RATE_SESSION_TOKEN: limitedToken, E2E_MEMBER_SESSION_TOKEN: memberToken, E2E_OTHER_SESSION_TOKEN: otherToken,
      E2E_FIXTURE_IDS: JSON.stringify({organization:fixture.organizationA.id,project:fixture.projectA.id,ticket:fixture.ticket.id,meeting:fixture.meetingA.id,transcript:fixture.transcript.id,minutes:fixture.minutes.id,candidate:fixture.candidate.id,recording:fixture.recording.id}), E2E_VIEWER_SESSION_TOKEN: viewerToken, E2E_LIVE_PROJECT_ID: fixture.projectA.id,
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
