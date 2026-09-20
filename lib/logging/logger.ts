import "server-only";
import { requestContext } from "./context";
import { redact } from "./redaction";
// No arbitrary error messages, request bodies, headers or URLs are accepted.
const allowed = new Set(["event", "operation", "requestId", "userId", "organizationId", "projectId", "resourceType", "resourceId", "meetingId", "minutesId", "recordingId", "candidateId", "ticketId", "result", "durationMs", "status", "errorType", "provider", "action", "modelId", "promptVersion", "schemaVersion", "inputBytes", "outputBytes", "inputTokens", "outputTokens", "transportRetryCount", "schemaRepairCount", "candidateCount", "idempotentHit", "conflict"]);
export function logEvent(value: Record<string, unknown>, level: "info" | "warn" | "error" = "info") {
  const fields = Object.fromEntries(Object.entries(value).filter(([key]) => allowed.has(key)));
  const context = requestContext.getStore();
  console[level](JSON.stringify({ ...redact(fields) as object, ...context, timestamp: new Date().toISOString(), level }));
}
