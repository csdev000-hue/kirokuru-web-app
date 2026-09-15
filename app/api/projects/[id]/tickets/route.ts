import { withCurrentUser } from "@/lib/auth/api";
import { readBody, resourceId, type RouteContext } from "@/lib/api/request";
import { createTicketSchema } from "@/lib/validators/ticket";
import { listTickets, createTicket } from "@/lib/services/ticket-service";
export function GET(request: Request, context: RouteContext) { return withCurrentUser(async (user) => Response.json(await listTickets(user.id, resourceId((await context.params).id), Object.fromEntries(new URL(request.url).searchParams))))(); }
export function POST(request: Request, context: RouteContext) { return withCurrentUser(async (user) => Response.json({ data: await createTicket(user.id, resourceId((await context.params).id), await readBody(request, createTicketSchema)) }, { status: 201 }))(); }
