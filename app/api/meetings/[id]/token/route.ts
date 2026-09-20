import { withCurrentUser } from "@/lib/auth/api";
import { readBody, resourceId, type RouteContext } from "@/lib/api/request";
import { liveMeetingActionSchema } from "@/lib/validators/live-meeting";
import { createMeetingToken } from "@/lib/services/live-meeting-service";
export function POST(request: Request, context: RouteContext) { return withCurrentUser(async (user, requestId) => {
 await readBody(request, liveMeetingActionSchema);
 return Response.json({ data: await createMeetingToken({ userId: user.id, meetingId: resourceId((await context.params).id), requestId }), requestId });
})(); }
