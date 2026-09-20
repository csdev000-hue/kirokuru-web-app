import { z } from "zod";
import nextEnv from "@next/env";
import { forbiddenPublicKeys } from "../lib/security/secret-inspection";
import { securityHeaders } from "../lib/security/security-headers";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const flag = z.enum(["true", "false"]);
const required = z.string().min(1);
const schema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }), AUTH_SECRET: z.string().min(32), AUTH_URL: z.url({ protocol: /^https$/ }),
  AUTH_GOOGLE_ID: required, AUTH_GOOGLE_SECRET: required, AUTH_TRUST_HOST: z.literal("true"),
  AI_ENABLED: flag, RECORDING_ENABLED: flag, LIVE_MEETING_ENABLED: flag,
});
const parsed = schema.safeParse(process.env);
const problems = parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.'));
problems.push(...forbiddenPublicKeys(process.env));
for (const [flagName, keys] of [["AI_ENABLED", ["AWS_REGION", "BEDROCK_MODEL_ID"]], ["RECORDING_ENABLED", ["AWS_REGION", "S3_BUCKET_NAME"]], ["LIVE_MEETING_ENABLED", ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]]] as const) {
  if (process.env[flagName] === "true") for (const key of keys) if (!process.env[key]) problems.push(key);
}
try { securityHeaders("offline-check", "/", { ...process.env, NODE_ENV: "production" }); } catch { problems.push("provider origins"); }
if (problems.length) { console.error("Offline readiness: review configuration fields:", [...new Set(problems)].join(", ")); process.exitCode = 1; }
else console.info("Offline configuration check passed. No DB/provider connection or Production change performed. Credentials, privileges and environment isolation still require operational verification.");
