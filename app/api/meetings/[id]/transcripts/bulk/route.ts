import { z } from "zod";
import { withCurrentUser } from "@/lib/auth/api";
import { readBody, resourceId } from "@/lib/api/request";
import { bulkCreateTranscripts } from "@/lib/services/meeting-transcript-service";
export function POST(request: Request, context: { params: Promise<{ id: string }> }) { return withCurrentUser(async (user) => Response.json({ data: await bulkCreateTranscripts(user.id, resourceId((await context.params).id), await readBody(request, z.unknown())) }, { status: 201 }))(); }
