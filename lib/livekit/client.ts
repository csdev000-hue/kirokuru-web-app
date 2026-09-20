import "server-only";
import { RoomServiceClient } from "livekit-server-sdk";
import { getLiveKitEnv } from "@/lib/env";

let client: RoomServiceClient | undefined;

export function getLiveKitClient() {
  const env = getLiveKitEnv();
  const url = new URL(env.LIVEKIT_URL);
  if (url.protocol === "wss:") url.protocol = "https:";
  if (url.protocol === "ws:") url.protocol = "http:";
  return client ??= new RoomServiceClient(url.toString(), env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, { requestTimeout: 10, failover: false });
}
