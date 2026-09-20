import "server-only";
import { z } from "zod";
import { validateEnvironment } from "@/lib/utils/env-validation";
export const liveMeetingEnabled = () => process.env.LIVE_MEETING_ENABLED === "true";
export const getLiveMeetingSettings = () => validateEnvironment(z.object({
 LIVEKIT_TOKEN_TTL_SECONDS: z.coerce.number().int().min(900).max(3600).default(1800),
 LIVEKIT_MAX_PARTICIPANTS: z.coerce.number().int().min(2).max(100).default(20),
}), process.env);
