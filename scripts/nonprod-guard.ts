import { readFile } from "node:fs/promises";
import { validateConfig, policySchema, assertCloudApply, assertDatabaseTarget, configurationDigest } from "../infra/aws/config";
try {
  if (!process.env.NONPROD_CONFIG_FILE) throw new Error("Missing configuration");
  const input = JSON.parse(await readFile(process.env.NONPROD_CONFIG_FILE, "utf8"));
  const policy = policySchema.parse(input.policy); const config = validateConfig(input.config, policy);
  if (process.argv.includes("--database")) assertDatabaseTarget(config, policy, process.env.DATABASE_URL || "");
  if (process.argv.includes("--apply")) {
    if (process.env.CLOUD_APPLY_ALLOWED !== "true" || !process.env.NONPROD_APPROVAL_FILE) throw new Error("No approval");
    assertCloudApply(config, policy, JSON.parse(await readFile(process.env.NONPROD_APPROVAL_FILE, "utf8")));
  }
  console.info(JSON.stringify({ status: "PASS_LOCAL_POLICY_ONLY", digest: configurationDigest(config, policy), cloudChanges: "NOT EXECUTED" }));
} catch { console.error("Nonproduction guard BLOCKED: configuration, database target or explicit approval invalid; values omitted"); process.exitCode = 2; }
