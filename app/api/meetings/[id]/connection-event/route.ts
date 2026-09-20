import { withCurrentUser } from "@/lib/auth/api";
import { readBody, resourceId, type RouteContext } from "@/lib/api/request";
import { liveConnectionEventSchema } from "@/lib/validators/live-meeting";
import { recordLiveConnectionEvent } from "@/lib/services/live-meeting-service";
export function POST(request: Request, context: RouteContext) { return withCurrentUser(async (user, requestId) => Response.json({ data: await recordLiveConnectionEvent({ userId: user.id, meetingId: resourceId((await context.params).id), requestId }, await readBody(request, liveConnectionEventSchema)), requestId }))(); }
