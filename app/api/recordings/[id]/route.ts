import { withCurrentUser } from "@/lib/auth/api";
import { resourceId, type RouteContext } from "@/lib/api/request";
import { readBody } from "@/lib/api/request";
import { z } from "zod";
import { getRecording, deleteRecording } from "@/lib/services/meeting-recording-service";
export function GET(_request: Request, context: RouteContext) { return withCurrentUser(async (user, requestId) => Response.json({ data: await getRecording(user.id, resourceId((await context.params).id)), requestId }))(); }
export function DELETE(request: Request, context: RouteContext) { return withCurrentUser(async (user, requestId) => { await readBody(request, z.object({}).strict()); return Response.json({ data: await deleteRecording({ userId: user.id, requestId }, resourceId((await context.params).id)), requestId }); })(); }
