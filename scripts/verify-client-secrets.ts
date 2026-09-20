import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import nextEnv from "@next/env";
import { secretPatterns, forbiddenPublicKeys } from "../lib/security/secret-inspection";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
if (forbiddenPublicKeys(process.env).length) throw new Error("Forbidden public secret environment keys");
const keys = ["DATABASE_URL", "AUTH_SECRET", "AUTH_GOOGLE_SECRET", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"];
const values = keys.flatMap((k) => process.env[k] && process.env[k]!.length >= 8 ? [process.env[k]!] : []);
let count = 0; const failures: string[] = [];
function scan(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { scan(path); continue; }
    if (!/\.(js|json|map|html)$/.test(path)) continue;
    const text = readFileSync(path, "utf8"); count++;
    if (values.some((value) => text.includes(value)) || secretPatterns(text).length || /livekit-server-sdk|@aws-sdk\/client-bedrock-runtime|drizzle-orm\/postgres-js/.test(text)) failures.push(path);
  }
}
scan(".next/static"); // Missing build is a failure, never a silent skip.
if (failures.length) { console.error("Client secret/module check failed:", failures.join(", ")); process.exitCode = 1; }
else console.info(`Client secret/module check passed (${count} artifacts).`);
