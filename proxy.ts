import { NextResponse, type NextRequest } from "next/server";
import { securityHeaders } from "@/lib/security/security-headers";
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const headers = securityHeaders(nonce, request.nextUrl.pathname);
  const incoming = new Headers(request.headers);
  incoming.set("Content-Security-Policy", headers["Content-Security-Policy"]);
  incoming.set("x-nonce", nonce);
  const response = NextResponse.next({ request: { headers: incoming } });
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
