import "server-only";
import { requireMeetingAccess } from "@/lib/permissions/resource";
import { configuredLimit, enforceLimit } from "./rate-limit";
export async function limitAIResource(userId: string, meetingId: string) {
  const access = await requireMeetingAccess({ userId, meetingId, minimumRole: "member" });
  await enforceLimit(`ai:project:${access.projectId}`, configuredLimit("RATE_LIMIT_AI_PROJECT_PER_MINUTE", 30));
  await enforceLimit(`ai:meeting:${meetingId}`, configuredLimit("RATE_LIMIT_AI_RESOURCE_PER_MINUTE", 5));
}
