import { handlers } from "@/lib/auth/config";
import { getAuthSettings } from "@/lib/auth/settings";
import type { NextRequest } from "next/server";
export const runtime = "nodejs";
const unavailable = () => Response.json({ error: { code: "SERVICE_UNAVAILABLE", message: "現在ログインを利用できません。" } }, { status: 503, headers: { "Cache-Control": "no-store" } });
export const GET = (request: NextRequest) => getAuthSettings() ? handlers.GET(request) : unavailable();
export const POST = (request: NextRequest) => getAuthSettings() ? handlers.POST(request) : unavailable();
