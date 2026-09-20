import { withCurrentUser } from "@/lib/auth/api";
import { readBody, resourceId, type RouteContext } from "@/lib/api/request";
import { registerCandidateSchema } from "@/lib/validators/ticket-registration";
import { registerTicketCandidate } from "@/lib/services/ticket-registration-service";
export function POST(request: Request, context: RouteContext) { return withCurrentUser(async (user, requestId) => { await readBody(request, registerCandidateSchema); const data = await registerTicketCandidate({ userId: user.id, candidateId: resourceId((await context.params).id), requestId }); return Response.json({ data, requestId }, { status: data.existing ? 200 : 201 }); })(request); }
