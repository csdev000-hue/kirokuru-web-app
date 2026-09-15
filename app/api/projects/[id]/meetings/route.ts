import { z } from "zod";
import { withCurrentUser } from "@/lib/auth/api";
import { readBody, resourceId } from "@/lib/api/request";
import { listMeetings, createMeeting } from "@/lib/services/meeting-service";
type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) { return withCurrentUser(async (user) => Response.json(await listMeetings(user.id, resourceId((await context.params).id), Object.fromEntries(new URL(request.url).searchParams))))(); }
export function POST(request: Request, context: Context) { return withCurrentUser(async (user) => Response.json({ data: await createMeeting(user.id, resourceId((await context.params).id), await readBody(request, z.unknown())) }, { status: 201 }))(); }
