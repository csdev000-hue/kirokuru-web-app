import { withCurrentUser } from "@/lib/auth/api";
import { resourceId, type RouteContext } from "@/lib/api/request";
import { z } from "zod";
import { readBody } from "@/lib/api/request";
import { createRecordingUpload } from "@/lib/services/meeting-recording-service";
export function POST(request: Request, context: RouteContext) { return withCurrentUser(async (user, requestId) => Response.json({ data: await createRecordingUpload({ userId: user.id, requestId }, resourceId((await context.params).id), await readBody(request, z.unknown())), requestId }, { status: 201 }))(); }
