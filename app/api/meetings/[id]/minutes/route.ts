import { withCurrentUser } from "@/lib/auth/api";
import { resourceId, type RouteContext } from "@/lib/api/request";
import { validationError } from "@/lib/api/errors";
import { minutesQuerySchema } from "@/lib/validators/meeting-minutes";
import { listMinutes } from "@/lib/services/meeting-minutes-service";
export function GET(request: Request, context: RouteContext) { return withCurrentUser(async (user) => { const query = minutesQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams)); if (!query.success) throw validationError(); return Response.json({ data: await listMinutes(user.id, resourceId((await context.params).id), query.data.version) }); })(request); }
