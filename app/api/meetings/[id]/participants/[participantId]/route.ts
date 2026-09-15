import { z } from "zod";
import { withCurrentUser } from "@/lib/auth/api";
import { readBody, requireWriteOrigin, resourceId } from "@/lib/api/request";
import { updateParticipant, removeParticipant } from "@/lib/services/meeting-participant-service";
type Context = { params: Promise<{ id: string; participantId: string }> };
export function PATCH(request: Request, context: Context) { return withCurrentUser(async (user) => { const params = await context.params; return Response.json({ data: await updateParticipant(user.id, resourceId(params.id), resourceId(params.participantId), await readBody(request, z.unknown())) }); })(); }
export function DELETE(request: Request, context: Context) { return withCurrentUser(async (user) => { requireWriteOrigin(request); const params = await context.params; await removeParticipant(user.id, resourceId(params.id), resourceId(params.participantId)); return new Response(null, { status: 204 }); })(); }
