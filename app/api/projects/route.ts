import { withCurrentUser } from "@/lib/auth/api";
import { readBody } from "@/lib/api/request";
import { createProjectSchema } from "@/lib/validators/project";
import { listProjects, createProject } from "@/lib/services/project-service";
import { projectQuerySchema } from "@/lib/validators/project";
import { validationError } from "@/lib/api/errors";
export function GET(request: Request) { return withCurrentUser(async (user) => { const query = projectQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams)); if (!query.success) throw validationError();
    return Response.json({ data: await listProjects(user.id, query.data.organizationId) }); })(request); }
export function POST(request: Request) { return withCurrentUser(async (user) => Response.json({ data: await createProject(user.id, await readBody(request, createProjectSchema)) }, { status: 201 }))(request); }
