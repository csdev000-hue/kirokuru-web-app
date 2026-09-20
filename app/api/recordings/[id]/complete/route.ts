import { withCurrentUser } from "@/lib/auth/api";
import { resourceId, type RouteContext } from "@/lib/api/request";
import { z } from "zod";
import { readBody } from "@/lib/api/request";
import { completeRecordingUpload } from "@/lib/services/meeting-recording-service";
export function POST(request: Request, context: RouteContext) { return withCurrentUser(async (user, requestId) => { await readBody(request, z.object({}).strict()); return Response.json({ data: await completeRecordingUpload({ userId: user.id, requestId }, resourceId((await context.params).id)), requestId }); })(); }
