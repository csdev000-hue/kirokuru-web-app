import "server-only";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import type { getDb } from "@/lib/db/client";
import { users, auditLogs } from "@/lib/db/schema";
import { ApplicationError } from "@/lib/errors/application-error";
import { configuredLimit } from "./rate-limit";
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
/** Supplemental transaction-local guard for direct service calls and legacy audit history. */
export async function limitAuditedOperations(tx: Tx, userId: string, scope: "recording" | readonly string[]) {
  await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
  const [row] = await tx.select({ hits: count() }).from(auditLogs).where(and(
    eq(auditLogs.userId, userId),
    scope === "recording" ? eq(auditLogs.resourceType, "recording") : inArray(auditLogs.action, [...scope]),
    gte(auditLogs.createdAt, new Date(Date.now() - 60000)),
  ));
  const limit = configuredLimit(scope === "recording" ? "RATE_LIMIT_PRESIGNED_URL_PER_MINUTE" : "RATE_LIMIT_TOKEN_PER_MINUTE", 30);
  if (row.hits >= limit) throw new ApplicationError("RATE_LIMIT_EXCEEDED", 429, "短時間に操作が集中しています。1分後に再試行してください。", true, 60);
}
