import { withCurrentUser } from "@/lib/auth/api";
import { readBody } from "@/lib/api/request";
import { createOrganizationSchema } from "@/lib/validators/organization";
import { listOrganizations, createOrganization } from "@/lib/services/organization-service";
export function GET(request: Request) { return withCurrentUser(async (user) => { return Response.json({ data: await listOrganizations(user.id) }); })(request); }
export function POST(request: Request) { return withCurrentUser(async (user) => Response.json({ data: await createOrganization(user.id, await readBody(request, createOrganizationSchema)) }, { status: 201 }))(request); }
