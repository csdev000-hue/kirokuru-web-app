import "server-only";
import { ApplicationError, databaseError } from "./application-error";
import { logEvent } from "@/lib/logging/logger";
export function errorResponse(error: unknown, requestId: string) {
  const safe = error instanceof ApplicationError ? error : databaseError(error);
  const status = safe?.status ?? 500;
  const legacyLimit = safe?.code === "RECORDING_RATE_LIMITED" || safe?.code === "LIVE_MEETING_RATE_LIMITED";
  const code = legacyLimit ? "RATE_LIMIT_EXCEEDED" : safe?.code ?? "INTERNAL_ERROR";
  logEvent({ event: "security", operation: "api", requestId, result: code, status, errorType: safe ? "ApplicationError" : "InternalError" }, "warn");
  return Response.json({ error: { code, message: safe?.expose ? safe.message : "予期しないエラーが発生しました。" }, requestId }, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId, ...(status === 429 ? { "Retry-After": String(safe?.retryAfterSeconds ?? 60) } : {}) } });
}
