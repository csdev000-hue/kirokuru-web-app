// Local-only S3 protocol double. Never imported by the application.
import { createServer } from "node:http";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const hmac = (key: string | Buffer, value: string) => createHmac("sha256", key).update(value).digest();
const escape = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
export async function startS3Server() {
 const objects = new Map<string, { body: Buffer; type: string }>();
 const server = createServer(async (request, response) => {
  const url = new URL(request.url!, `http://${request.headers.host}`);
  const origin = request.headers.origin;
  if (origin === "http://127.0.0.1:3100") {
   response.setHeader("Access-Control-Allow-Origin", origin);
   response.setHeader("Access-Control-Allow-Methods", "PUT, GET, HEAD");
   response.setHeader("Access-Control-Allow-Headers", "content-type,if-none-match,x-amz-server-side-encryption");
  }
  if (request.method === "OPTIONS") { response.writeHead(204).end(); return; }
  function signed() {
   const signature = url.searchParams.get("X-Amz-Signature");
   if (!signature) return request.headers.authorization?.includes("Credential=local-test/") && ["HEAD", "DELETE", "GET"].includes(request.method!);
   const date = url.searchParams.get("X-Amz-Date") ?? "";
   const stamp = Date.parse(date.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z"));
   if (!Number.isFinite(stamp) || Date.now() > stamp + Number(url.searchParams.get("X-Amz-Expires")) * 1000 || stamp > Date.now() + 60000) return false;
   const credential = (url.searchParams.get("X-Amz-Credential") ?? "").split("/");
   if (credential[0] !== "local-test") return false;
   const signedHeaders = url.searchParams.get("X-Amz-SignedHeaders") ?? "";
   const headers = signedHeaders.split(";").map((name) => `${name}:${String(request.headers[name] ?? "").trim().replace(/\s+/g, " ")}\n`).join("");
   const query = [...url.searchParams.entries()].filter(([k]) => k !== "X-Amz-Signature").map(([k, v]) => [escape(k), escape(v)]).sort(([a, av], [b, bv]) => a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0).map(([k, v]) => `${k}=${v}`).join("&");
   const canonical = [request.method, url.pathname, query, headers, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
   let key = hmac("AWS4local-test", credential[1]); for (const part of credential.slice(2)) key = hmac(key, part);
   const expected = hmac(key, ["AWS4-HMAC-SHA256", date, credential.slice(1).join("/"), hash(canonical)].join("\n")).toString("hex");
   return /^[0-9a-f]{64}$/.test(signature) && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }
  if (!signed()) { response.writeHead(403).end(); return; }
  const key = decodeURIComponent(url.pathname);
  if (request.method === "PUT") {
   if (request.headers["if-none-match"] !== "*" || request.headers["x-amz-server-side-encryption"] !== "AES256") { response.writeHead(400).end(); return; }
   if (objects.has(key)) { response.writeHead(412).end(); return; }
   const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
   const body = Buffer.concat(chunks); objects.set(key, { body, type: String(request.headers["content-type"]) }); response.writeHead(200, { ETag: '"local-etag"' }).end(); return;
  }
  if (request.method === "DELETE") { objects.delete(key); response.writeHead(204).end(); return; }
  const object = objects.get(key); if (!object) { response.writeHead(404).end(); return; }
  response.setHeader("Content-Type", object.type); response.setHeader("Content-Length", object.body.length); response.setHeader("Cache-Control", "private, no-store");
  response.writeHead(200).end(request.method === "HEAD" ? undefined : object.body);
 });
 await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
 const address = server.address(); if (!address || typeof address === "string") throw new Error("Local S3 startup failed");
 return { endpoint: `http://127.0.0.1:${address.port}`, objects, close: () => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close((e) => e ? reject(e) : resolve()); }) };
}
