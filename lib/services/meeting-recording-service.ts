import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { and, asc, count, eq, gte, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { auditLogs, meetingRecordings, meetingMinutes, meetingTranscripts, ticketCandidates, users, type MeetingRecording } from "@/lib/db/schema";
import { BusinessError } from "@/lib/api/errors";
import { requireMeetingAccess } from "@/lib/permissions/resource";
import { writeAuditLog, type AuditInput } from "@/lib/security/audit";
import { lockMeeting, meetingValidation } from "./meeting-common";
import { recordingStorage, recordingKey } from "@/lib/s3/recording-storage";
import { getRecordingSettings } from "@/lib/s3/config";
import { s3Error } from "@/lib/s3/errors";
import { canTransitionRecording, createRecordingUploadSchema, recordingContentTypeSchema, recordingListQuerySchema, type RecordingStatus } from "@/lib/validators/recording";
type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Context = { userId: string; requestId?: string };
const operationScope = new AsyncLocalStorage<{ meetingId?: string; projectId?: string }>();
const missing = () => new BusinessError("RECORDING_NOT_FOUND", 404, "録音が見つかりません。");
const invalid = () => new BusinessError("RECORDING_INVALID_STATUS", 409, "この状態では操作できません。録音一覧を更新してください。");
const safe = (r: MeetingRecording) => ({ id: r.id, meetingId: r.meetingId, contentType: r.contentType, fileSize: r.fileSize === null ? null : Number(r.fileSize), durationSeconds: r.durationSeconds, status: r.status, createdAt: r.createdAt, uploadedAt: r.uploadedAt });
async function find(id: string, db: Pick<Db, "select">) {
 const [r] = await db.select().from(meetingRecordings).where(and(eq(meetingRecordings.id, id), isNull(meetingRecordings.deletedAt))); if (!r) throw missing(); return r;
}
async function locked(ctx: Context, id: string, tx: Tx, writing = true) {
 const first = await find(id, tx);
 const access = writing ? (await lockMeeting(ctx.userId, first.meetingId, tx, false)).access : await requireMeetingAccess({ userId: ctx.userId, meetingId: first.meetingId }, tx);
 const [row] = await tx.select().from(meetingRecordings).where(and(eq(meetingRecordings.id, id), isNull(meetingRecordings.deletedAt))).for("update");
 if (!row) throw missing();
 const scope = operationScope.getStore(); if (scope) Object.assign(scope, { meetingId: row.meetingId, projectId: access.projectId });
 return { row, access };
}
async function audit(ctx: Context, row: MeetingRecording, organizationId: string, projectId: string, action: AuditInput["action"], tx: Tx, errorCode?: string) {
 await writeAuditLog({ organizationId, userId: ctx.userId, action, resourceType: "recording", resourceId: row.id, metadata: { recordingId: row.id, meetingId: row.meetingId, projectId, contentType: row.contentType, ...(row.fileSize !== null ? { fileSize: Number(row.fileSize) } : {}), requestId: ctx.requestId, errorCode } }, tx);
}
// DB-backed limit shared by all application instances; serialized per authenticated user.
async function limit(ctx: Context, tx: Tx) {
 await tx.select({ id: users.id }).from(users).where(eq(users.id, ctx.userId)).for("update");
 const [n] = await tx.select({ value: count() }).from(auditLogs).where(and(eq(auditLogs.userId, ctx.userId), eq(auditLogs.resourceType, "recording"), gte(auditLogs.createdAt, new Date(Date.now() - 60000))));
 if (n.value >= 30) throw new BusinessError("RECORDING_RATE_LIMITED", 429, "録音操作が集中しています。1分後に再試行してください。");
}
async function observed<T>(ctx: Context, operation: string, recordingId: string | undefined, meetingId: string | undefined, work: () => Promise<T>): Promise<T> {
 return operationScope.run({ meetingId }, async () => {
  const start = Date.now(); let result = "success";
  try { return await work(); } catch (e) { result = e instanceof BusinessError ? e.code : "failed"; throw e; }
  finally { console.info(JSON.stringify({ event: "recording", requestId: ctx.requestId, recordingId, ...operationScope.getStore(), operation, result, durationMs: Date.now() - start })); }
 });
}
export async function transitionRecordingStatus(row: MeetingRecording, next: RecordingStatus, tx: Tx) {
 if (!canTransitionRecording(row.status, next)) throw invalid();
 await tx.update(meetingRecordings).set({ status: next }).where(and(eq(meetingRecordings.id, row.id), eq(meetingRecordings.status, row.status)));
}
export async function listRecordings(userId: string, meetingId: string, input: unknown = {}, db = getDb()) {
 await requireMeetingAccess({ userId, meetingId }, db); const q = meetingValidation(recordingListQuerySchema, input);
 const where = and(eq(meetingRecordings.meetingId, meetingId), isNull(meetingRecordings.deletedAt));
 const rows = await db.select().from(meetingRecordings).where(where).orderBy(asc(meetingRecordings.createdAt), asc(meetingRecordings.id)).limit(q.limit + 1).offset((q.page - 1) * q.limit);
 return { data: rows.slice(0, q.limit).map(safe), meta: { page: q.page, nextPage: rows.length > q.limit ? q.page + 1 : null } };
}
export async function getRecording(userId: string, id: string, db = getDb()) {
 const row = await find(id, db); await requireMeetingAccess({ userId, meetingId: row.meetingId }, db); return safe(row);
}
export async function createRecordingUpload(ctx: Context, meetingId: string, input: unknown, db = getDb()) {
 await requireMeetingAccess({ userId: ctx.userId, meetingId, minimumRole: "member" }, db);
 if (input && typeof input === "object" && "contentType" in input && !recordingContentTypeSchema.safeParse(input.contentType).success) throw new BusinessError("RECORDING_CONTENT_TYPE_NOT_ALLOWED", 422, "対応する音声・動画形式を選択してください。");
 const body = meetingValidation(createRecordingUploadSchema, input); const settings = getRecordingSettings();
 if (body.fileSize > settings.MAX_RECORDING_FILE_SIZE_BYTES) throw new BusinessError("RECORDING_FILE_TOO_LARGE", 413, "録音ファイルが容量上限を超えています。");
 const id = crypto.randomUUID();
 await db.transaction(async (tx) => {
  const { access } = await lockMeeting(ctx.userId, meetingId, tx, false); await limit(ctx, tx);
  await tx.insert(meetingRecordings).values({ id, meetingId, s3Key: recordingKey(access.organizationId, access.projectId, meetingId, id, body.contentType), contentType: body.contentType, fileSize: BigInt(body.fileSize) });
 });
 return issueUpload(ctx, id, db);
}
async function issueUpload(ctx: Context, id: string, db: Db) {
 return observed(ctx, "upload_url", id, undefined, async () => {
  const outcome = await db.transaction(async (tx) => {
   const { row, access } = await locked(ctx, id, tx); await limit(ctx, tx);
   if (row.status !== "uploading") throw invalid();
   if (Date.now() - row.createdAt.getTime() > 86400000) {
    await transitionRecordingStatus(row, "failed", tx); await audit(ctx, row, access.organizationId, access.projectId, "recording.upload.failed", tx, "RECORDING_UPLOAD_FAILED"); return { error: invalid() };
   }
   try {
    if (await recordingStorage.headObject(row.s3Key)) throw invalid();
    const expiresIn = getRecordingSettings().RECORDING_UPLOAD_URL_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    await tx.update(meetingRecordings).set({ uploadExpiresAt: expiresAt }).where(eq(meetingRecordings.id, id));
    const result = await recordingStorage.createUploadUrl(row.s3Key, row.contentType, Number(row.fileSize), expiresIn);
    await audit(ctx, row, access.organizationId, access.projectId, "recording.upload_url.issue", tx);
    return { data: { recordingId: id, uploadUrl: result.url, headers: result.headers, expiresIn, expiresAt } };
   } catch (error) {
    if (error instanceof BusinessError && error.code === "RECORDING_INVALID_STATUS") throw error;
    await transitionRecordingStatus(row, "failed", tx);
    await audit(ctx, row, access.organizationId, access.projectId, "recording.upload.failed", tx, "S3_PROVIDER_ERROR");
    return { error: error instanceof BusinessError ? error : s3Error(error) };
   }
  });
  if (outcome.error) throw outcome.error; return outcome.data!;
 });
}
export const retryRecordingUpload = (ctx: Context, id: string, db = getDb()) => issueUpload(ctx, id, db);
function validateObject(row: MeetingRecording, object: Awaited<ReturnType<typeof recordingStorage.headObject>>) {
 if (!object) throw new BusinessError("RECORDING_OBJECT_NOT_FOUND", 409, "アップロードが未完了です。ファイルを再送してください。");
 if (!recordingContentTypeSchema.safeParse(object.contentType).success || object.contentType !== row.contentType) throw new BusinessError("RECORDING_CONTENT_TYPE_MISMATCH", 422, "録音形式が一致しません。新しくアップロードしてください。");
 if (object.fileSize !== undefined && object.fileSize > getRecordingSettings().MAX_RECORDING_FILE_SIZE_BYTES) throw new BusinessError("RECORDING_FILE_TOO_LARGE", 413, "録音ファイルが容量上限を超えています。");
 if (!Number.isSafeInteger(object.fileSize) || !object.fileSize || object.fileSize < 1 || BigInt(object.fileSize) !== row.fileSize) throw new BusinessError("RECORDING_SIZE_MISMATCH", 422, "録音サイズが一致しません。新しくアップロードしてください。");
 return { contentType: object.contentType!, fileSize: BigInt(object.fileSize) };
}
export async function completeRecordingUpload(ctx: Context, id: string, db = getDb()) {
 return observed(ctx, "complete", id, undefined, async () => {
  const outcome = await db.transaction(async (tx) => {
   const { row, access } = await locked(ctx, id, tx); await limit(ctx, tx);
   if (row.status !== "uploading" && row.status !== "uploaded") throw invalid();
   try {
    const verified = validateObject(row, await recordingStorage.headObject(row.s3Key));
    if (row.status === "uploading") {
     await transitionRecordingStatus(row, "uploaded", tx);
     await tx.update(meetingRecordings).set({ ...verified, uploadedAt: new Date() }).where(eq(meetingRecordings.id, id));
    }
    await audit(ctx, row, access.organizationId, access.projectId, "recording.upload.complete", tx);
    return { data: safe(await find(id, tx)) };
   } catch (error) {
    const mapped = error instanceof BusinessError ? error : s3Error(error);
    // Missing object and transient provider failures remain retryable. Invalid metadata is quarantined.
    if (["RECORDING_CONTENT_TYPE_MISMATCH", "RECORDING_FILE_TOO_LARGE", "RECORDING_SIZE_MISMATCH"].includes(mapped.code)) await transitionRecordingStatus(row, "failed", tx);
    await audit(ctx, row, access.organizationId, access.projectId, "recording.upload.failed", tx, mapped.code);
    return { error: mapped };
   }
  });
  if (outcome.error) throw outcome.error; return outcome.data!;
 });
}
export async function createRecordingDownloadUrl(ctx: Context, id: string, db = getDb()) {
 return observed(ctx, "download_url", id, undefined, () => db.transaction(async (tx) => {
  const { row, access } = await locked(ctx, id, tx, false); await limit(ctx, tx);
  if (!["uploaded", "processing", "completed"].includes(row.status)) throw invalid();
  validateObject(row, await recordingStorage.headObject(row.s3Key));
  const expiresIn = getRecordingSettings().RECORDING_DOWNLOAD_URL_TTL_SECONDS;
  const downloadUrl = await recordingStorage.createDownloadUrl(row.s3Key, expiresIn);
  await audit(ctx, row, access.organizationId, access.projectId, "recording.download_url.issue", tx);
  return { downloadUrl, expiresIn };
 }));
}
export async function deleteRecording(ctx: Context, id: string, db = getDb()) {
 return observed(ctx, "delete", id, undefined, () => db.transaction(async (tx) => {
  const { row, access } = await locked(ctx, id, tx);
  if (["processing", "completed"].includes(row.status)) throw invalid();
  const dependencies = await Promise.all([
   tx.select({ id: meetingTranscripts.id }).from(meetingTranscripts).where(eq(meetingTranscripts.meetingId, row.meetingId)).limit(1),
   tx.select({ id: meetingMinutes.id }).from(meetingMinutes).where(eq(meetingMinutes.meetingId, row.meetingId)).limit(1),
   tx.select({ id: ticketCandidates.id }).from(ticketCandidates).where(eq(ticketCandidates.meetingId, row.meetingId)).limit(1),
  ]);
  if (dependencies.some((rows) => rows.length)) throw new BusinessError("RECORDING_DEPENDENCY_EXISTS", 409, "文字起こし・議事録等の根拠となる録音は削除できません。");
  try { await recordingStorage.deleteObject(row.s3Key); } catch { throw new BusinessError("RECORDING_DELETE_FAILED", 502, "録音を削除できませんでした。再試行してください。"); }
  // Keep a tombstone, including the last PUT expiry: late browser PUTs remain traceable.
  await tx.update(meetingRecordings).set({ deletedAt: new Date() }).where(eq(meetingRecordings.id, id));
  await audit(ctx, row, access.organizationId, access.projectId, "recording.delete", tx);
  return { id };
 }));
}
/** Internal only. A real authenticated actor is still required; no anonymous worker bypass. */
export async function getRecordingForProcessing(userId: string, id: string, db = getDb()) {
 const row = await find(id, db); const access = await requireMeetingAccess({ userId, meetingId: row.meetingId, minimumRole: "member" }, db);
 if (!inProcessingState(row.status)) throw invalid();
 return { recordingId: id, meetingId: row.meetingId, projectId: access.projectId, s3Key: row.s3Key, contentType: row.contentType, fileSize: row.fileSize, status: row.status };
}
const inProcessingState = (status: RecordingStatus) => ["uploaded", "processing", "completed"].includes(status);
