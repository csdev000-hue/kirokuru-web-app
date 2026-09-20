import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { secretPatterns, forbiddenPublicKeys } from "../lib/security/secret-inspection";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\0").filter(Boolean);
const failures: string[] = [];
for (const file of files) {
  if (!existsSync(file)) continue;
  if (/(^|\/)\.env(?:\.|$)/.test(file) && file !== ".env.example") { failures.push(`${file}: tracked environment file`); continue; }
  const text = readFileSync(file, "utf8");
  // Documentation/tests contain examples of forbidden public names, not configuration.
  for (const rule of secretPatterns(text)) if (rule !== "public-secret" || (!file.startsWith("docs/") && !file.startsWith("tests/"))) failures.push(`${file}: ${rule}`);
  if (/^(?:app|components|lib)\//.test(file) && /dangerouslySetInnerHTML|sql\.raw\(|\beval\(|\bexecSync\(/.test(text)) failures.push(`${file}: unsafe code primitive`);
}
for (const key of forbiddenPublicKeys(process.env)) failures.push(`environment: forbidden public key ${key}`);
if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
else console.info(`Security source scan passed (${files.length} files). Pattern scanning cannot prove absence of every secret; review is still required.`);
