import { withCurrentUser } from "@/lib/auth/api";
import { resourceId, type RouteContext } from "@/lib/api/request";
import { listTicketCandidates } from "@/lib/services/ticket-candidate-service";
export function GET(request: Request, context: RouteContext) { return withCurrentUser(async (user) => Response.json({ data: await listTicketCandidates(user.id, resourceId((await context.params).id), Object.fromEntries(new URL(request.url).searchParams)) }))(request); }
