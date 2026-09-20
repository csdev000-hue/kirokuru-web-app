import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { startLiveKitServer } from "../helpers/livekit-server";
import { liveMeetingProvider } from "@/lib/livekit/provider";
let server: Awaited<ReturnType<typeof startLiveKitServer>>;
beforeAll(async () => { server = await startLiveKitServer(); });
beforeEach(() => { vi.stubEnv("LIVEKIT_URL", server.endpoint); vi.stubEnv("LIVEKIT_API_KEY", server.apiKey); vi.stubEnv("LIVEKIT_API_SECRET", server.apiSecret); });
afterAll(async () => { await server?.close(); });
it("real SDK Twirp create/token/participant/delete against loopback provider", async () => {
 await liveMeetingProvider.ensureRoom("meeting_test"); await liveMeetingProvider.ensureRoom("meeting_test"); expect(server.rooms.size).toBe(1);
 expect(await liveMeetingProvider.hasParticipant("meeting_test", "user_test")).toBe(false);
 const token = await liveMeetingProvider.createParticipantToken({ roomName: "meeting_test", identity: "user_test", displayName: "Test", role: "member" });
 expect((await fetch(`${server.endpoint}/test/join`, { method: "POST", headers: { authorization: `Bearer ${token.token}` }, body: "{}" })).status).toBe(200);
 expect(await liveMeetingProvider.hasParticipant("meeting_test", "user_test")).toBe(true);
 await liveMeetingProvider.endRoom("meeting_test"); await liveMeetingProvider.endRoom("meeting_test"); expect(server.rooms.size).toBe(0);
});
