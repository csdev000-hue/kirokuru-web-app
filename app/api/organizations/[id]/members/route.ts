import { withCurrentUser } from "@/lib/auth/api";
import { resourceId, type RouteContext } from "@/lib/api/request";
import { listOrganizationMembers } from "@/lib/services/organization-service";
export function GET(request: Request, context: RouteContext) { return withCurrentUser(async (user) => Response.json({ data: await listOrganizationMembers(user.id, resourceId((await context.params).id)) }))(request); }
