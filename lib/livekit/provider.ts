import "server-only";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { getLiveKitEnv } from "@/lib/env";
import { getLiveKitClient } from "./client";
import { getLiveMeetingSettings } from "./config";
import { BusinessError } from "@/lib/api/errors";
import type { ProjectRole } from "@/lib/permissions/roles";
export function participantGrant(room: string, role: ProjectRole) {
 return { room, roomJoin: true, canSubscribe: true, canPublish: role !== "viewer", canPublishData: false, canUpdateOwnMetadata: false, roomAdmin: false, roomCreate: false, roomList: false, roomRecord: false, ...(role !== "viewer" ? { canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO] } : {}) };
}
export interface LiveMeetingProvider {
 ensureRoom(roomName: string): Promise<void>;
 endRoom(roomName: string): Promise<void>;
 hasParticipant(roomName: string, identity: string): Promise<boolean>;
 createParticipantToken(input: { roomName: string; identity: string; displayName: string; role: ProjectRole }): Promise<{ token: string; serverUrl: string; expiresIn: number }>;
}
export function liveKitError(error: unknown) {
 const code = error && typeof error === "object" && "code" in error ? error.code : "";
 return new BusinessError("LIVEKIT_PROVIDER_ERROR", code === "deadline_exceeded" ? 504 : 502, "会議サーバーに接続できません。時間をおいて再試行してください。");
}
const missing = (error: unknown) => error !== null && typeof error === "object" && "code" in error && error.code === "not_found";
export const liveMeetingProvider: LiveMeetingProvider = {
 async ensureRoom(name) {
  try { await getLiveKitClient().createRoom({ name, emptyTimeout: 300, departureTimeout: 60, maxParticipants: getLiveMeetingSettings().LIVEKIT_MAX_PARTICIPANTS }); } catch (e) { throw new BusinessError("LIVEKIT_ROOM_CREATE_FAILED", liveKitError(e).status, "オンライン会議を開始できませんでした。再試行してください。"); }
 },
 async endRoom(name) { try { await getLiveKitClient().deleteRoom(name); } catch (e) { if (!missing(e)) throw new BusinessError("LIVEKIT_ROOM_END_FAILED", liveKitError(e).status, "オンライン会議を終了できませんでした。再試行してください。"); } },
 async hasParticipant(room, identity) { try { await getLiveKitClient().getParticipant(room, identity); return true; } catch (e) { if (missing(e)) return false; throw liveKitError(e); } },
 async createParticipantToken(input) {
  try {
   const env = getLiveKitEnv(); const expiresIn = getLiveMeetingSettings().LIVEKIT_TOKEN_TTL_SECONDS;
   const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, { identity: input.identity, name: input.displayName, ttl: expiresIn });
   token.addGrant(participantGrant(input.roomName, input.role));
   const url = new URL(env.LIVEKIT_URL); if (url.protocol === "https:") url.protocol = "wss:"; if (url.protocol === "http:") url.protocol = "ws:";
   return { token: await token.toJwt(), serverUrl: url.toString(), expiresIn };
  } catch { throw new BusinessError("LIVEKIT_TOKEN_FAILED", 502, "会議参加情報を発行できませんでした。"); }
 },
};
