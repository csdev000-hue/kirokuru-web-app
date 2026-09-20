import { withCurrentUser } from "@/lib/auth/api";
import { resourceId, type RouteContext } from "@/lib/api/request";
import { listRecordings } from "@/lib/services/meeting-recording-service";
export function GET(request: Request, context: RouteContext) { return withCurrentUser(async (user, requestId) => Response.json({ ...await listRecordings(user.id, resourceId((await context.params).id), Object.fromEntries(new URL(request.url).searchParams)), requestId }))(); }
