import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { startS3Server } from "../helpers/s3-server";
import { recordingStorage } from "@/lib/s3/recording-storage";
let server: Awaited<ReturnType<typeof startS3Server>>;
beforeAll(async () => {
 server = await startS3Server();
});
beforeEach(() => {
 for (const [key, value] of Object.entries({ AWS_REGION: "ap-northeast-1", S3_BUCKET_NAME: "local-recordings-test", AWS_ACCESS_KEY_ID: "local-test", AWS_SECRET_ACCESS_KEY: "local-test", AWS_SESSION_TOKEN: "", AWS_ENDPOINT_URL_S3: server.endpoint, AWS_EC2_METADATA_DISABLED: "true" })) vi.stubEnv(key, value);
});
afterAll(async () => { await server?.close(); });
it("signed PUT / HEAD / signed GET / DELETE round trip, private access and immutable upload", async () => {
 const key = "organizations/test/recordings/file.webm"; const data = Buffer.from("local recording");
 const upload = await recordingStorage.createUploadUrl(key, "audio/webm", data.length, 60);
 expect(new URL(upload.url).searchParams.get("X-Amz-SignedHeaders")).toContain("content-length");
 expect((await fetch(upload.url, { method: "PUT", headers: upload.headers, body: data })).status).toBe(200);
 expect((await fetch(upload.url, { method: "PUT", headers: upload.headers, body: data })).status).toBe(412);
 expect(await recordingStorage.headObject(key)).toEqual({ contentType: "audio/webm", fileSize: data.length });
 const download = await recordingStorage.createDownloadUrl(key, 60);
 expect(await (await fetch(download)).text()).toBe(data.toString());
 const publicUrl = new URL(download); publicUrl.search = ""; expect((await fetch(publicUrl)).status).toBe(403);
 await recordingStorage.deleteObject(key); expect(await recordingStorage.headObject(key)).toBeNull();
 await recordingStorage.deleteObject(key);
});
it("signature binds type, size and key; expired URL denied", async () => {
 const upload = await recordingStorage.createUploadUrl("test/bound.webm", "audio/webm", 3, 60);
 expect((await fetch(upload.url, { method: "PUT", headers: { ...upload.headers, "Content-Type": "text/html" }, body: "123" })).status).toBe(403);
 expect((await fetch(upload.url, { method: "PUT", headers: upload.headers, body: "1234" })).status).toBe(403);
 const altered = upload.url.replace("bound.webm", "other.webm"); expect((await fetch(altered, { method: "PUT", headers: upload.headers, body: "123" })).status).toBe(403);
 const expired = new URL(upload.url); expired.searchParams.set("X-Amz-Date", "20200101T000000Z"); expect((await fetch(expired, { method: "PUT", headers: upload.headers, body: "123" })).status).toBe(403);
});
