import { z } from "zod";
import { withCurrentUser } from "@/lib/auth/api";
import { readBody, resourceId, type RouteContext } from "@/lib/api/request";
import { listTicketComments, createTicketComment } from "@/lib/services/ticket-comment-service";
export function GET(request: Request, context: RouteContext) { return withCurrentUser(async (user) => Response.json({ data: await listTicketComments(user.id, resourceId((await context.params).id)) }))(request); }
export function POST(request: Request, context: RouteContext) { return withCurrentUser(async (user) => Response.json({ data: await createTicketComment(user.id, resourceId((await context.params).id), await readBody(request, z.unknown())) }, { status: 201 }))(request); }
