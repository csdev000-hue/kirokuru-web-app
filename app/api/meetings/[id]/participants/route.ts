import { z } from "zod";
import { withCurrentUser } from "@/lib/auth/api";
import { readBody, resourceId } from "@/lib/api/request";
import { listParticipants, addParticipant } from "@/lib/services/meeting-participant-service";
type Context = { params: Promise<{ id: string }> };
export function GET(_request: Request, context: Context) { return withCurrentUser(async (user) => Response.json({ data: await listParticipants(user.id, resourceId((await context.params).id)) }))(); }
export function POST(request: Request, context: Context) { return withCurrentUser(async (user) => Response.json({ data: await addParticipant(user.id, resourceId((await context.params).id), await readBody(request, z.unknown())) }, { status: 201 }))(); }
