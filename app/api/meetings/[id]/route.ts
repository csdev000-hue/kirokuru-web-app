import { z } from "zod";
import { withCurrentUser } from "@/lib/auth/api";
import { readBody, requireWriteOrigin, resourceId } from "@/lib/api/request";
import { getMeeting, updateMeeting, deleteMeeting } from "@/lib/services/meeting-service";
type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) { return withCurrentUser(async (user) => Response.json({ data: await getMeeting(user.id, resourceId((await context.params).id)) }))(request); }
export function PATCH(request: Request, context: Context) { return withCurrentUser(async (user) => Response.json({ data: await updateMeeting(user.id, resourceId((await context.params).id), await readBody(request, z.unknown())) }))(request); }
export function DELETE(request: Request, context: Context) { return withCurrentUser(async (user) => { requireWriteOrigin(request); await deleteMeeting(user.id, resourceId((await context.params).id)); return new Response(null, { status: 204 }); })(request); }
