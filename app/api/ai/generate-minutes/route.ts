import { limitAIResource } from "@/lib/security/ai-rate-limit";
import { withCurrentUser } from "@/lib/auth/api";
import { readBody } from "@/lib/api/request";
import { generateMinutesSchema } from "@/lib/validators/meeting-minutes";
import { generateMeetingMinutes } from "@/lib/ai/services/generate-minutes";
export const maxDuration = 60;
export function POST(request: Request) { return withCurrentUser(async (user, requestId) => { const data = await readBody(request, generateMinutesSchema); await limitAIResource(user.id, data.meetingId); return Response.json({ data: await generateMeetingMinutes({ ...data, userId: user.id, requestId, idempotencyKey: request.headers.get("Idempotency-Key") ?? undefined }) }, { status: 201 }); })(request); }
