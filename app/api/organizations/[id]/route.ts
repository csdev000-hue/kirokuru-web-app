import { withCurrentUser } from "@/lib/auth/api";
import { readBody, requireWriteOrigin, resourceId, type RouteContext } from "@/lib/api/request";
import { updateOrganizationSchema } from "@/lib/validators/organization";
import { getOrganization, updateOrganization, deleteOrganization } from "@/lib/services/organization-service";
export function GET(request: Request, context: RouteContext) { return withCurrentUser(async (user) => Response.json({ data: await getOrganization(user.id, resourceId((await context.params).id)) }))(request); }
export function PATCH(request: Request, context: RouteContext) { return withCurrentUser(async (user) => Response.json({ data: await updateOrganization(user.id, resourceId((await context.params).id), await readBody(request, updateOrganizationSchema)) }))(request); }
export function DELETE(request: Request, context: RouteContext) { return withCurrentUser(async (user) => { requireWriteOrigin(request); await deleteOrganization(user.id, resourceId((await context.params).id)); return new Response(null, { status: 204 }); })(request); }
