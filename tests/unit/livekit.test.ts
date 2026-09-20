import { beforeEach, expect, it, vi } from "vitest";
import { TokenVerifier } from "livekit-server-sdk";
import { liveMeetingProvider, participantGrant } from "@/lib/livekit/provider";
import { getLiveKitIdentity, getLiveKitRoomName, parseLiveKitIdentity, liveMeetingActionSchema } from "@/lib/validators/live-meeting";
import { getLiveMeetingSettings } from "@/lib/livekit/config";
const id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => { vi.stubEnv("LIVEKIT_URL", "wss://local.invalid"); vi.stubEnv("LIVEKIT_API_KEY", "test-key"); vi.stubEnv("LIVEKIT_API_SECRET", "test-secret-long-enough-for-local-testing"); });
it("LK-U01/02/07 deterministic UUID names with strict identity parsing", () => { expect(getLiveKitRoomName(id)).toBe(`meeting_${id}`); expect(parseLiveKitIdentity(getLiveKitIdentity(id))).toBe(id); expect(() => getLiveKitRoomName("name@example.com")).toThrow(); expect(() => parseLiveKitIdentity(id)).toThrow(); });
it.each(["owner", "member", "viewer"] as const)("LK-U03/04/05 signed %s grants/TTL", async (role) => {
 const result = await liveMeetingProvider.createParticipantToken({ roomName: getLiveKitRoomName(id), identity: getLiveKitIdentity(id), displayName: "<script>alert(1)</script>", role });
 const claims = await new TokenVerifier("test-key", "test-secret-long-enough-for-local-testing").verify(result.token);
 expect(claims.sub).toBe(`user_${id}`); expect(claims.video).toMatchObject({ room: `meeting_${id}`, roomJoin: true, canPublish: role !== "viewer", canSubscribe: true, roomAdmin: false, roomCreate: false, canPublishData: false });
 expect(claims.exp! - claims.nbf!).toBeLessThanOrEqual(1800); expect(result.expiresIn).toBe(1800); expect(result.serverUrl).toBe("wss://local.invalid/");
});
it("LK-U06 TTL bounds", () => { vi.stubEnv("LIVEKIT_TOKEN_TTL_SECONDS", "86400"); expect(getLiveMeetingSettings).toThrow(); });
it.each(["role", "canPublish", "identity", "roomName", "joinedAt", "leftAt"])("LK-U08 rejects client %s", (key) => { expect(liveMeetingActionSchema.safeParse({ [key]: "tamper" }).success).toBe(false); });
it("viewer never receives publishing sources/admin", () => { expect(participantGrant("room", "viewer")).not.toHaveProperty("canPublishSources"); expect(participantGrant("room", "viewer").roomAdmin).toBe(false); });
