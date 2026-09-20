import { handlers } from "@/lib/auth/config";
import { getAuthSettings } from "@/lib/auth/settings";
import type { NextRequest } from "next/server";
import { requestContext } from "@/lib/logging/context";
import { errorResponse } from "@/lib/errors/error-response";
import { ApplicationError } from "@/lib/errors/application-error";
import { limitAuthentication } from "@/lib/security/auth-rate-limit";
import { logEvent } from "@/lib/logging/logger";
export const runtime = "nodejs";
async function handle(request: NextRequest, method: "GET" | "POST") {
  const requestId = crypto.randomUUID();
  return requestContext.run({ requestId }, async () => {
    try {
      if (!getAuthSettings()) throw new ApplicationError("SERVICE_UNAVAILABLE", 503, "現在ログインを利用できません。");
      await limitAuthentication();
      // Preserve Auth.js CSRF, OAuth redirects, cookies and protocol JSON.
      const response = await handlers[method](request);
      const headers = new Headers(response.headers);
      headers.set("X-Request-Id", requestId); headers.set("Cache-Control", "no-store");
      logEvent({ event: "authentication", status: response.status });
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (error) { return errorResponse(error, requestId); }
  });
}
export const GET = (request: NextRequest) => handle(request, "GET");
export const POST = (request: NextRequest) => handle(request, "POST");
