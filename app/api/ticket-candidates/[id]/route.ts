import { withCurrentUser } from "@/lib/auth/api";
import { readBody, resourceId, type RouteContext } from "@/lib/api/request";
import { updateCandidateSchema } from "@/lib/validators/ticket-candidate";
import { getTicketCandidate, updateTicketCandidate } from "@/lib/services/ticket-candidate-service";
export function GET(request: Request, context: RouteContext) { return withCurrentUser(async (user) => Response.json({ data: await getTicketCandidate(user.id, resourceId((await context.params).id)) }))(request); }
export function PATCH(request: Request, context: RouteContext) { return withCurrentUser(async (user) => Response.json({ data: await updateTicketCandidate(user.id, resourceId((await context.params).id), await readBody(request, updateCandidateSchema)) }))(request); }
