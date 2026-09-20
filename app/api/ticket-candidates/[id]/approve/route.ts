import { z } from "zod";
import { withCurrentUser } from "@/lib/auth/api";
import { readBody, resourceId, type RouteContext } from "@/lib/api/request";
import { approveTicketCandidate } from "@/lib/services/ticket-candidate-service";
export function POST(request: Request, context: RouteContext) { return withCurrentUser(async (user) => { await readBody(request, z.object({}).strict()); return Response.json({ data: await approveTicketCandidate(user.id, resourceId((await context.params).id)) }); })(request); }
