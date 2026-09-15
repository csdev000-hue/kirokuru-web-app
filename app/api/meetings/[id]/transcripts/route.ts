import { z } from "zod";
import { withCurrentUser } from "@/lib/auth/api";
import { readBody, resourceId } from "@/lib/api/request";
import { listTranscripts, createTranscript } from "@/lib/services/meeting-transcript-service";
type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) { return withCurrentUser(async (user) => Response.json(await listTranscripts(user.id, resourceId((await context.params).id), Object.fromEntries(new URL(request.url).searchParams))))(); }
export function POST(request: Request, context: Context) { return withCurrentUser(async (user) => Response.json({ data: await createTranscript(user.id, resourceId((await context.params).id), await readBody(request, z.unknown())) }, { status: 201 }))(); }
