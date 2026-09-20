// Loopback-only provider double: real SDK/Twirp and JWT verification, no media transport.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { TokenVerifier } from "livekit-server-sdk";
export async function startLiveKitServer() {
 const apiKey = "local-livekit-test"; const apiSecret = randomBytes(32).toString("hex"); const verifier = new TokenVerifier(apiKey, apiSecret);
 const rooms = new Set<string>(); const participants = new Map<string, Set<string>>();
 const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  const fail = (status: number, code: string) => res.writeHead(status).end(JSON.stringify({ code, msg: "Local provider response" }));
  try {
   const token = req.headers.authorization?.replace(/^Bearer /, ""); if (!token) { fail(401, "unauthenticated"); return; }
   const claims = await verifier.verify(token); const chunks = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
   const data = JSON.parse(Buffer.concat(chunks).toString() || "{}");
   if (req.url === "/test/join") {
    const room = claims.video?.room; if (!room || !claims.video?.roomJoin || !claims.sub || !rooms.has(room)) { fail(403, "permission_denied"); return; }
    const set = participants.get(room) ?? new Set(); set.add(claims.sub); participants.set(room, set); res.end("{}"); return;
   }
   const method = req.url?.split("/").pop();
   if (method === "CreateRoom" && claims.video?.roomCreate) { rooms.add(data.name); res.end(JSON.stringify({ name: data.name, sid: `RM_${data.name}` })); return; }
   if (method === "DeleteRoom" && claims.video?.roomCreate) { rooms.delete(data.room); participants.delete(data.room); res.end("{}"); return; }
   if (method === "GetParticipant" && claims.video?.roomAdmin && claims.video.room === data.room) {
    if (!participants.get(data.room)?.has(data.identity)) { fail(404, "not_found"); return; }
    res.end(JSON.stringify({ identity: data.identity, sid: "PA_local" })); return;
   }
   fail(403, "permission_denied");
  } catch { fail(401, "unauthenticated"); }
 });
 server.on("upgrade", (_request, socket) => { socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n"); });
 await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); if (!address || typeof address === "string") throw new Error("Local provider failed");
 return { endpoint: `http://127.0.0.1:${address.port}`, apiKey, apiSecret, rooms, participants, close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }) };
}
