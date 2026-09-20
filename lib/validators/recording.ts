import { z } from "zod";
export const recordingTypes = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "video/webm": "webm", "video/mp4": "mp4" } as const;
export type RecordingContentType = keyof typeof recordingTypes;
export const recordingContentTypeSchema = z.enum(Object.keys(recordingTypes) as [RecordingContentType, ...RecordingContentType[]]);
export const createRecordingUploadSchema = z.object({ contentType: recordingContentTypeSchema, fileSize: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict();
export const recordingIdSchema = z.uuid();
export const recordingListQuerySchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }).strict();
export type RecordingStatus = "uploading" | "uploaded" | "processing" | "completed" | "failed";
export function canTransitionRecording(from: RecordingStatus, to: RecordingStatus) {
 return ({ uploading: ["uploaded", "failed"], uploaded: ["processing", "failed"], processing: ["completed", "failed"], completed: [], failed: [] } as Record<RecordingStatus, RecordingStatus[]>)[from].includes(to);
}
