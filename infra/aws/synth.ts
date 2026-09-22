import { readFile } from "node:fs/promises";
import { App } from "aws-cdk-lib";
import { NonprodStack } from "./nonprod-stack";
import { validateConfig, policySchema } from "./config";
// No AWS SDK, CLI, credential resolution, CDK lookups or deployment code here.
try {
  const fixture = process.argv.includes("--fixture");
  const file = fixture ? "tests/infrastructure/fixture.json" : process.env.NONPROD_CONFIG_FILE;
  if (!file) throw new Error("Missing configuration");
  const input = JSON.parse(await readFile(file, "utf8"));
  const policy = policySchema.parse(input.policy);
  const config = validateConfig(input.config, policy);
  const app = new App({ outdir: fixture ? "cdk.out/fixture" : "cdk.out/nonprod", context: { "aws:cdk:enable-path-metadata": false, "aws:cdk:enable-asset-metadata": false } });
  new NonprodStack(app, config, policy);
  const assembly = app.synth();
  if (assembly.manifest.missing?.length) throw new Error("Context lookup forbidden");
  console.info(`Offline CDK synth succeeded (${fixture ? "synthetic fixture, not deployable approval" : "configuration only, no approval"})`);
} catch { console.error("Offline synth refused: invalid/missing configuration or forbidden context; values omitted"); process.exitCode = 1; }
