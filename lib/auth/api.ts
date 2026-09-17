import "server-only";
import { BusinessError } from "@/lib/api/errors";
import { requireCurrentUser } from "./current-user";
import type { CurrentUser } from "./types";
import { AccessError } from "@/lib/permissions/errors";
import { createInternalErrorResponse } from "@/lib/errors";
import { logSecurityEvent } from "@/lib/security/logging";
export function withCurrentUser(handler: (user: CurrentUser, requestId: string) => Promise<Response> | Response) {
  return async () => {
    const requestId = crypto.randomUUID();
    try {
      const user = await requireCurrentUser();
      const response = await handler(user, requestId);
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("X-Request-Id", requestId);
      return response;
    } catch (error) {
      if (error instanceof BusinessError) return Response.json({ error: { code: error.code, message: error.message }, requestId }, { status: error.status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
      const code = error instanceof AccessError ? error.code : "INTERNAL_ERROR";
      logSecurityEvent({ requestId, action: code === "UNAUTHENTICATED" ? "authenticate" : "authorize", result: code });
      return Response.json(error instanceof AccessError ? { error: { code: error.code, message: error.message }, requestId } : createInternalErrorResponse(requestId), {
        status: error instanceof AccessError ? error.status : 500,
        headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
      });
    }
  };
}
