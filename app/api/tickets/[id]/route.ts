import { withCurrentUser } from "@/lib/auth/api";
import { readBody, requireWriteOrigin, resourceId, type RouteContext } from "@/lib/api/request";
import { updateTicketSchema } from "@/lib/validators/ticket";
import { getTicket, updateTicket, deleteTicket } from "@/lib/services/ticket-service";
export function GET(_request: Request, context: RouteContext) { return withCurrentUser(async (user) => Response.json({ data: await getTicket(user.id, resourceId((await context.params).id)) }))(); }
export function PATCH(request: Request, context: RouteContext) { return withCurrentUser(async (user) => Response.json({ data: await updateTicket(user.id, resourceId((await context.params).id), await readBody(request, updateTicketSchema)) }))(); }
export function DELETE(request: Request, context: RouteContext) { return withCurrentUser(async (user) => { requireWriteOrigin(request); await deleteTicket(user.id, resourceId((await context.params).id)); return new Response(null, { status: 204 }); })(); }
