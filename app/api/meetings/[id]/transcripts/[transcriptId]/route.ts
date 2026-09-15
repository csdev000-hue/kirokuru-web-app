import { z } from "zod";
import { withCurrentUser } from "@/lib/auth/api";
import { readBody, requireWriteOrigin, resourceId } from "@/lib/api/request";
import { updateTranscript, deleteTranscript } from "@/lib/services/meeting-transcript-service";
type Context = { params: Promise<{ id: string; transcriptId: string }> };
export function PATCH(request: Request, context: Context) { return withCurrentUser(async (user) => { const params = await context.params; return Response.json({ data: await updateTranscript(user.id, resourceId(params.id), resourceId(params.transcriptId), await readBody(request, z.unknown())) }); })(); }
export function DELETE(request: Request, context: Context) { return withCurrentUser(async (user) => { requireWriteOrigin(request); const params = await context.params; await deleteTranscript(user.id, resourceId(params.id), resourceId(params.transcriptId)); return new Response(null, { status: 204 }); })(); }
