import "server-only";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getS3Client } from "./client";
import { getS3Env } from "@/lib/env";
import { isMissingObject, s3Error } from "./errors";
import { recordingIdSchema, recordingTypes, type RecordingContentType } from "@/lib/validators/recording";
export interface RecordingStorage {
 createUploadUrl(key: string, contentType: string, fileSize: number, expiresIn: number): Promise<{ url: string; headers: Record<string, string> }>;
 headObject(key: string): Promise<{ contentType?: string; fileSize?: number } | null>;
 createDownloadUrl(key: string, expiresIn: number): Promise<string>;
 deleteObject(key: string): Promise<void>;
}
export function recordingKey(organizationId: string, projectId: string, meetingId: string, recordingId: string, contentType: RecordingContentType) {
 for (const id of [organizationId, projectId, meetingId, recordingId]) recordingIdSchema.parse(id);
 return `organizations/${organizationId}/projects/${projectId}/meetings/${meetingId}/recordings/${recordingId}.${recordingTypes[contentType]}`;
}
export const recordingStorage: RecordingStorage = {
 async createUploadUrl(Key, ContentType, ContentLength, expiresIn) {
  try {
   const headers = { "Content-Type": ContentType, "If-None-Match": "*", "x-amz-server-side-encryption": "AES256" };
   const url = await getSignedUrl(getS3Client(), new PutObjectCommand({ Bucket: getS3Env().S3_BUCKET_NAME, Key, ContentType, ContentLength, IfNoneMatch: "*", ServerSideEncryption: "AES256" }), { expiresIn, signableHeaders: new Set(["content-type", "content-length", "if-none-match"]), unhoistableHeaders: new Set(["x-amz-server-side-encryption"]) });
   return { url, headers };
  } catch (error) { throw s3Error(error); }
 },
 async headObject(Key) {
  try { const result = await getS3Client().send(new HeadObjectCommand({ Bucket: getS3Env().S3_BUCKET_NAME, Key }), { abortSignal: AbortSignal.timeout(10000) }); return { contentType: result.ContentType, fileSize: result.ContentLength }; }
  catch (error) { if (isMissingObject(error)) return null; throw s3Error(error); }
 },
 async createDownloadUrl(Key, expiresIn) {
  try { return await getSignedUrl(getS3Client(), new GetObjectCommand({ Bucket: getS3Env().S3_BUCKET_NAME, Key, ResponseContentDisposition: "attachment", ResponseCacheControl: "private, no-store" }), { expiresIn }); }
  catch (error) { throw s3Error(error); }
 },
 async deleteObject(Key) {
  try { await getS3Client().send(new DeleteObjectCommand({ Bucket: getS3Env().S3_BUCKET_NAME, Key }), { abortSignal: AbortSignal.timeout(10000) }); }
  catch (error) { throw s3Error(error); }
 },
};
