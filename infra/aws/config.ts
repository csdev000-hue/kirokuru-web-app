import { createHash } from "node:crypto";
import { z } from "zod";
const account = z.string().regex(/^\d{12}$/);
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);
const host = z.string().regex(/^[a-z0-9][a-z0-9.-]+$/);
const target = z.object({ host, database: slug, role: z.string().regex(/^[a-zA-Z0-9_-]+$/) }).strict();
export const configSchema = z.object({
  synthetic: z.boolean(),
  environment: z.enum(["dev", "test", "preview"]),
  accountId: account, region: z.string().regex(/^[a-z]{2}-[a-z]+-\d$/), stackName: z.string().regex(/^kirokuru-(dev|test|preview)-[a-z0-9-]+$/),
  bucketName: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
  vercel: z.object({ team: slug, project: slug, issuerMode: z.enum(["team", "global"]), environment: z.enum(["development", "preview"]) }).strict(),
  corsOrigins: z.array(z.url().refine(v => { const u = new URL(v); return u.protocol === "https:" && u.origin === v && !v.includes("*") && !u.username && !u.password; })).min(1),
  bedrockModelId: z.string().regex(/^[a-zA-Z0-9.:-]+$/),
  awsBudgetUsd: z.number().positive().finite(), monthlyBudgetJpy: z.literal(3000),
  s3WarningBytes: z.number().int().positive(), bedrockDailyTokenWarning: z.number().int().positive(),
  database: target,
}).strict();
export const policySchema = z.object({
  allowedAccountIds: z.array(account).min(1), productionAccountIds: z.array(account).min(1),
  allowedRegions: z.array(z.string()).min(1), allowedStackNames: z.array(z.string()).min(1),
  allowedDatabases: z.array(target).min(1), productionDatabaseHosts: z.array(host).min(1),
}).strict();
export type NonprodConfig = z.infer<typeof configSchema>;
export type IsolationPolicy = z.infer<typeof policySchema>;
const normalizedHost = (value: string) => value.toLowerCase().replace(/\.$/, "").replace(/-pooler(?=\.)/, "");
export function validateConfig(input: unknown, policyInput: unknown): NonprodConfig {
  // Do not include Zod issues or untrusted input in error messages (may contain secrets).
  const c = configSchema.safeParse(input); const p = policySchema.safeParse(policyInput);
  if (!c.success || !p.success) throw new Error("Invalid nonproduction configuration or isolation policy");
  const config = c.data; const policy = p.data;
  if (!policy.allowedAccountIds.includes(config.accountId) || policy.productionAccountIds.includes(config.accountId) || policy.allowedAccountIds.some(a => policy.productionAccountIds.includes(a))) throw new Error("AWS account denied");
  if (!policy.allowedRegions.includes(config.region) || !policy.allowedStackNames.includes(config.stackName) || !config.stackName.startsWith(`kirokuru-${config.environment}-`)) throw new Error("Region or stack denied");
  if (config.vercel.environment !== (config.environment === "dev" ? "development" : "preview")) throw new Error("OIDC environment mismatch");
  const db = config.database;
  if (policy.productionDatabaseHosts.some(h => normalizedHost(h) === normalizedHost(db.host)) || !policy.allowedDatabases.some(t => t.host === db.host && t.database === db.database && t.role === db.role)) throw new Error("Database target denied");
  return config;
}
export function assertDatabaseTarget(config: NonprodConfig, policy: IsolationPolicy, connectionString: string) {
  validateConfig(config, policy);
  let u: URL; try { u = new URL(connectionString); } catch { throw new Error("Database target denied"); }
  if (!["postgres:", "postgresql:"].includes(u.protocol) || u.hostname !== config.database.host || u.pathname !== `/${config.database.database}` || u.username !== config.database.role || (u.port && u.port !== "5432") || u.searchParams.get("sslmode") !== "verify-full" || [...u.searchParams.keys()].some(k => k !== "sslmode")) throw new Error("Database target denied");
}
export function configurationDigest(config: NonprodConfig, policy: IsolationPolicy) {
  return createHash("sha256").update(JSON.stringify({ config: validateConfig(config, policy), policy: policySchema.parse(policy) })).digest("hex");
}
export function assertCloudApply(config: NonprodConfig, policy: IsolationPolicy, input: unknown, now = new Date()) {
  if (config.synthetic) throw new Error("Cloud Apply denied: synthetic configuration");
  const approval = z.object({ allowed: z.literal(true), digest: z.string(), accountId: account, stackName: z.string(), expiresAt: z.iso.datetime(), reference: z.string().min(1), fixture: z.literal(false) }).strict().safeParse(input);
  if (!approval.success || approval.data.digest !== configurationDigest(config, policy) || approval.data.accountId !== config.accountId || approval.data.stackName !== config.stackName || Date.parse(approval.data.expiresAt) <= now.getTime()) throw new Error("Cloud Apply denied: explicit matching unexpired approval required");
}
