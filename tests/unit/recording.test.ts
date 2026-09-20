import { expect, it, vi } from "vitest";
import { recordingKey } from "@/lib/s3/recording-storage";
import { canTransitionRecording, createRecordingUploadSchema, recordingListQuerySchema, recordingTypes } from "@/lib/validators/recording";
import { getRecordingSettings } from "@/lib/s3/config";
import { s3Error } from "@/lib/s3/errors";
it.each(Object.entries(recordingTypes))("key %s uses server extension %s", (type, extension) => { const ids = Array.from({ length: 4 }, () => crypto.randomUUID()); expect(recordingKey(ids[0], ids[1], ids[2], ids[3], type as keyof typeof recordingTypes)).toBe(`organizations/${ids[0]}/projects/${ids[1]}/meetings/${ids[2]}/recordings/${ids[3]}.${extension}`); });
it("key refuses path injection", () => { expect(() => recordingKey("../other", crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), "audio/webm")).toThrow(); });
it("state transitions reserved for future processing, failed terminal", () => { expect(canTransitionRecording("uploading", "uploaded")).toBe(true); expect(canTransitionRecording("uploaded", "processing")).toBe(true); expect(canTransitionRecording("processing", "completed")).toBe(true); expect(canTransitionRecording("completed", "uploading")).toBe(false); expect(canTransitionRecording("failed", "uploading")).toBe(false); });
it("strict validation and pagination", () => { expect(createRecordingUploadSchema.safeParse({ contentType: "audio/webm", fileSize: 3, bucket: "bad" }).success).toBe(false); expect(recordingListQuerySchema.safeParse({ limit: 10000 }).success).toBe(false); });
it("settings bound size and TTL", () => { vi.stubEnv("RECORDING_UPLOAD_URL_TTL_SECONDS", "86400"); expect(getRecordingSettings).toThrow(); });
it.each(["AccessDenied", "NoSuchKey", "TimeoutError", "AbortError", "NetworkError"])("safe provider error %s", (name) => { const error = s3Error({ name, message: "PRIVATE_URL" }); expect(error.message).not.toContain("PRIVATE_URL"); expect(error.status).toBe(["TimeoutError", "AbortError"].includes(name) ? 504 : 502); });
it("offline consistency identifies missing/orphan/stale/deleted objects without keys in output", async () => {
 const { checkRecordingConsistency } = await import("@/lib/s3/consistency");
 const base = { id: crypto.randomUUID(), s3Key: "private-a", status: "uploaded", fileSize: BigInt(3), contentType: "audio/webm", createdAt: new Date(0), deletedAt: null, uploadExpiresAt: null };
 const rows = [base, { ...base, id: crypto.randomUUID(), s3Key: "private-b", status: "uploading" }, { ...base, id: crypto.randomUUID(), s3Key: "private-c", deletedAt: new Date(0) }];
 const result = await checkRecordingConsistency(rows, { headObject: async (key) => key === "private-c" ? { contentType: "audio/webm", fileSize: 3 } : null }, ["private-c", "orphan"]);
 expect(result).toMatchObject({ staleUploading: 1, orphanObjectCount: 1, totalBytes: 3 }); expect(result.findings.map((f) => f.issue)).toEqual(["missing_object", "stale_uploading", "deleted_object_cleanup_required"]); expect(JSON.stringify(result)).not.toContain("private-");
});
