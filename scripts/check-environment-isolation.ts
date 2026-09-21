import { access, readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// Offline inventory only. Never loads .env files, credential stores or remote accounts.
// Presence and different resource names do not prove IAM/network isolation.
const exists = async (path: string) => access(path).then(() => true, () => false);
const example = await readFile(".env.example", "utf8");
const keys = [...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(m => m[1]);
const files = await readdir(".");
const report = {
  checkedAt: new Date().toISOString(),
  method: "offline metadata and variable presence only; no secret values or provider calls",
  status: "BLOCKED",
  reason: "Remote environment ownership, credential scope, IAM and production access denial require independent evidence.",
  local: {
    examplePresent: true,
    // Fixed names only; do not emit arbitrary file names that could contain sensitive text.
    envFilePresence: Object.fromEntries([".env", ".env.local", ".env.development", ".env.development.local", ".env.test", ".env.test.local", ".env.production", ".env.production.local"].map(name => [name, files.includes(name)])),
    shellVariablePresence: Object.fromEntries(keys.map(key => [key, Boolean(process.env[key])])),
    vercelProjectLinkPresent: await exists(".vercel/project.json"),
    awsConfigFilePresent: await exists(join(homedir(), ".aws/config")),
    awsCredentialFilePresent: await exists(join(homedir(), ".aws/credentials")),
  },
  remoteChecks: {
    dev: "BLOCKED: not inspected",
    preview: "BLOCKED: not inspected",
    production: "NOT RUN: secret retrieval and connection prohibited",
    realProviderSmoke: "BLOCKED: isolation and cost gates not satisfied by this inventory",
  },
};
console.info(JSON.stringify(report, null, 2));
process.exitCode = 2;
