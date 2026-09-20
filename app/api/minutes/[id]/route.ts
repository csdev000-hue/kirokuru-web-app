import { withCurrentUser } from "@/lib/auth/api";
import { readBody, resourceId, type RouteContext } from "@/lib/api/request";
import { editMinutesSchema } from "@/lib/validators/meeting-minutes";
import { getMinutes, updateMinutes } from "@/lib/services/meeting-minutes-service";
export function GET(request: Request, context: RouteContext) { return withCurrentUser(async (user) => Response.json({ data: await getMinutes(user.id, resourceId((await context.params).id)) }))(request); }
export function PATCH(request: Request, context: RouteContext) { return withCurrentUser(async (user) => Response.json({ data: await updateMinutes(user.id, resourceId((await context.params).id), await readBody(request, editMinutesSchema)) }))(request); }
