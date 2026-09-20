import { limitAIResource } from "@/lib/security/ai-rate-limit";
import { withCurrentUser } from "@/lib/auth/api";
import { readBody } from "@/lib/api/request";
import { generateCandidatesSchema } from "@/lib/validators/ticket-candidate";
import { generateTicketCandidates } from "@/lib/ai/services/generate-ticket-candidates";
export const maxDuration = 60;
export function POST(request: Request) { return withCurrentUser(async (user, requestId) => { const input = await readBody(request, generateCandidatesSchema); await limitAIResource(user.id, input.meetingId); return Response.json({ data: await generateTicketCandidates({ ...input, userId: user.id, requestId, idempotencyKey: request.headers.get("Idempotency-Key") ?? undefined }) }, { status: 201 }); })(request); }
