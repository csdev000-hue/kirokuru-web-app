import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { ApplicationError } from "@/lib/errors/application-error";
export type LimitInput = { key: string; limit: number; windowSeconds: number };
export interface RateLimiter {
  check(input: LimitInput): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }>;
}
const inputSchema = z.object({ key: z.string().min(1).max(500), limit: z.number().int().min(1).max(100000), windowSeconds: z.number().int().min(1).max(86400) });
export function databaseRateLimiter(db: Pick<ReturnType<typeof getDb>, "execute">): RateLimiter {
  return { async check(input) {
    const { key, limit, windowSeconds } = inputSchema.parse(input);
    const hash = createHash("sha256").update(key).digest("hex");
    // Atomic UPSERT, DB clock, capped count; commits independently of business rollback.
    const [row] = await db.execute<{ hits: number; retry: number }>(sql`
      INSERT INTO rate_limits (key, hits, expires_at)
      VALUES (${hash}, 1, clock_timestamp() + ${windowSeconds} * interval '1 second')
      ON CONFLICT (key) DO UPDATE SET
        hits = CASE WHEN rate_limits.expires_at <= clock_timestamp() THEN 1 ELSE LEAST(rate_limits.hits + 1, ${limit + 1}) END,
        expires_at = CASE WHEN rate_limits.expires_at <= clock_timestamp() THEN clock_timestamp() + ${windowSeconds} * interval '1 second' ELSE rate_limits.expires_at END
      RETURNING hits, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - clock_timestamp()))))::integer AS retry`);
    return { allowed: row.hits <= limit, remaining: Math.max(0, limit - row.hits), retryAfterSeconds: row.retry };
  } };
}
export function configuredLimit(name: string, fallback: number) {
  return z.coerce.number().int().min(1).max(100000).parse(process.env[name] ?? fallback);
}
export async function enforceLimit(key: string, limit: number, limiter: RateLimiter = databaseRateLimiter(getDb())) {
  const result = await limiter.check({ key, limit, windowSeconds: 60 });
  if (!result.allowed) throw new ApplicationError("RATE_LIMIT_EXCEEDED", 429, "短時間に操作が集中しています。少し時間をおいて再度お試しください。", true, result.retryAfterSeconds);
  return result;
}
export function apiRatePolicy(path: string) {
  path = canonicalApiPath(path);
  if (path.startsWith("/api/ai/")) return { group: "ai", limit: configuredLimit("RATE_LIMIT_AI_PER_MINUTE", 10) };
  if (/\/(?:upload-url|download-url)$/.test(path)) return { group: "presigned", limit: configuredLimit("RATE_LIMIT_PRESIGNED_URL_PER_MINUTE", 30) };
  if (/\/meetings\/[^/]+\/(?:token|room-token|start|end|join|connection-event)$/.test(path)) return { group: "live", limit: configuredLimit("RATE_LIMIT_TOKEN_PER_MINUTE", 30) };
  if (/\/(?:register|bulk-register)$/.test(path)) return { group: "registration", limit: configuredLimit("RATE_LIMIT_REGISTRATION_PER_MINUTE", 30) };
  return { group: "crud", limit: configuredLimit("RATE_LIMIT_API_PER_MINUTE", 600) };
}

export function canonicalApiPath(path: string) { return decodeURIComponent(path).replace(/\/+$/, ""); }
