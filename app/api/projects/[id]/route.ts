import { withCurrentUser } from "@/lib/auth/api";
import { readBody, requireWriteOrigin, resourceId, type RouteContext } from "@/lib/api/request";
import { updateProjectSchema } from "@/lib/validators/project";
import { getProject, updateProject, deleteProject } from "@/lib/services/project-service";
export function GET(_request: Request, context: RouteContext) { return withCurrentUser(async (user) => Response.json({ data: await getProject(user.id, resourceId((await context.params).id)) }))(); }
export function PATCH(request: Request, context: RouteContext) { return withCurrentUser(async (user) => Response.json({ data: await updateProject(user.id, resourceId((await context.params).id), await readBody(request, updateProjectSchema)) }))(); }
export function DELETE(request: Request, context: RouteContext) { return withCurrentUser(async (user) => { requireWriteOrigin(request); await deleteProject(user.id, resourceId((await context.params).id)); return new Response(null, { status: 204 }); })(); }
