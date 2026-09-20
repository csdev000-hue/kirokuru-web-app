import "server-only";
import { requireCurrentUser } from "./current-user";
import type { CurrentUser } from "./types";
import { requestContext } from "@/lib/logging/context";
import { logEvent } from "@/lib/logging/logger";
import { errorResponse } from "@/lib/errors/error-response";
import { apiRatePolicy, enforceLimit, canonicalApiPath } from "@/lib/security/rate-limit";
import { requireWriteOrigin } from "@/lib/api/request";
import { requireFeature } from "@/lib/security/feature-flags";
export function withCurrentUser(handler: (user: CurrentUser, requestId: string) => Promise<Response> | Response) {
  return async (request?: Request) => {
    const requestId = crypto.randomUUID();
    return requestContext.run({ requestId }, async () => {
      const started = Date.now(); let status = 500;
      try {
        const user = await requireCurrentUser();
        requestContext.getStore()!.userId = user.id;
        if (request) {
          if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) requireWriteOrigin(request);
          const path = canonicalApiPath(new URL(request.url).pathname);
          const policy = apiRatePolicy(path);
          await enforceLimit(`${policy.group}:user:${user.id}`, policy.limit);
          if (path.startsWith("/api/ai/")) requireFeature("AI_ENABLED");
          if (/\/recordings(?:\/|$)/.test(path) && request.method !== "DELETE") requireFeature("RECORDING_ENABLED");
        }
        const response = await handler(user, requestId);
        status = response.status;
        const headers = new Headers(response.headers);
        headers.set("Cache-Control", "no-store"); headers.set("X-Request-Id", requestId);
        // 204 and Auth.js protocol responses are intentionally bodyless/unwrapped.
        if (status === 204) return new Response(null, { status, headers });
        const body = await response.json();
        return Response.json({ ...body, requestId }, { status, headers });
      } catch (error) {
        const response = errorResponse(error, requestId); status = response.status; return response;
      } finally { logEvent({ event: "api", operation: "request", status, durationMs: Date.now() - started }); }
    });
  };
}
