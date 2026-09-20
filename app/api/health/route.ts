import { logEvent } from "@/lib/logging/logger";
export function GET() {
  const requestId = crypto.randomUUID();
  logEvent({ event: "health", requestId, status: 200 });
  return Response.json({ data: { status: "ok" }, requestId }, { headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}
