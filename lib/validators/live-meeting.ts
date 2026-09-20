import { z } from "zod";
export const liveMeetingActionSchema = z.object({}).strict();
export function getLiveKitRoomName(meetingId: string) { return `meeting_${z.uuid().parse(meetingId)}`; }
export function getLiveKitIdentity(userId: string) { return `user_${z.uuid().parse(userId)}`; }
export function parseLiveKitIdentity(identity: string) { return z.uuid().parse(identity.startsWith("user_") ? identity.slice(5) : ""); }
export const liveConnectionEventSchema = z.object({ state: z.enum(["reconnecting", "reconnected", "failed", "disconnected"]) }).strict();
