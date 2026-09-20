import { ApplicationError } from "@/lib/errors/application-error";
import { limitAuditedOperations } from "@/lib/security/audit-rate-limit";
import { AUDIT_ACTIONS } from "@/lib/security/audit-actions";
import { logEvent } from "@/lib/logging/logger";
import "server-only";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { meetings, meetingParticipants, users } from "@/lib/db/schema";
import { requireMeetingAccess } from "@/lib/permissions/resource";
import { BusinessError } from "@/lib/api/errors";
import { AccessError } from "@/lib/permissions/errors";
import { writeAuditLog, type AuditInput } from "@/lib/security/audit";
import { lockActiveProject } from "./ticket-service";
import { validateMeetingTransition } from "./meeting-service";
import { liveMeetingEnabled } from "@/lib/livekit/config";
import { liveMeetingProvider, liveKitError } from "@/lib/livekit/provider";
import { getLiveKitIdentity, getLiveKitRoomName, liveConnectionEventSchema } from "@/lib/validators/live-meeting";
type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Context = { userId: string; meetingId: string; requestId?: string };
const actions = [AUDIT_ACTIONS.MEETING_LIVE_END_REQUEST, AUDIT_ACTIONS.MEETING_LIVE_CONNECTION, AUDIT_ACTIONS.MEETING_LIVE_START, AUDIT_ACTIONS.MEETING_LIVE_TOKEN_ISSUE, AUDIT_ACTIONS.MEETING_LIVE_JOIN, AUDIT_ACTIONS.MEETING_LIVE_LEAVE, AUDIT_ACTIONS.MEETING_LIVE_END, AUDIT_ACTIONS.MEETING_LIVE_FAILED] as const;
async function accessAndLock(ctx: Context, tx: Tx, write = false, cleanup = false) {
 const access = await requireMeetingAccess({ userId: ctx.userId, meetingId: ctx.meetingId, minimumRole: write ? "member" : "viewer" }, tx);
 if (!cleanup) await lockActiveProject(access.projectId, tx);
 const [meeting] = await tx.select().from(meetings).where(eq(meetings.id, ctx.meetingId)).for("update");
 if (!meeting) throw new AccessError("RESOURCE_NOT_FOUND");
 if (meeting.minutesGenerationId && meeting.minutesGenerationExpiresAt && meeting.minutesGenerationExpiresAt > new Date() && !cleanup) throw new BusinessError("MINUTES_GENERATION_CONFLICT", 409, "議事録を生成中です。");
 return { access, meeting };
}
async function limit(ctx: Context, tx: Tx) {
 await limitAuditedOperations(tx, ctx.userId, actions);
}
async function audit(ctx: Context, action: AuditInput["action"], tx: Pick<Db, "insert">, access: Awaited<ReturnType<typeof requireMeetingAccess>>, errorCode?: string) {
 await writeAuditLog({ organizationId: access.organizationId, userId: ctx.userId, action, resourceType: "meeting", resourceId: ctx.meetingId, metadata: { meetingId: ctx.meetingId, projectId: access.projectId, participantUserId: ctx.userId, role: access.role, requestId: ctx.requestId, errorCode } }, tx);
}
async function operation<T>(ctx: Context, name: string, db: Db, work: () => Promise<T>) {
 const access = await requireMeetingAccess({ userId: ctx.userId, meetingId: ctx.meetingId }, db);
 const started = Date.now(); let result = "success";
 try { return await work(); }
 catch (e) {
  const error = e instanceof ApplicationError ? e : liveKitError(e); result = error.code;
  if (error instanceof BusinessError && error.status >= 500) await audit(ctx, AUDIT_ACTIONS.MEETING_LIVE_FAILED, db, access, error.code);
  throw error;
 } finally { logEvent({ event: "live_meeting", ...ctx, projectId: access.projectId, operation: name, result, durationMs: Date.now() - started }); }
}
function enabled() { if (!liveMeetingEnabled()) throw new BusinessError("LIVE_MEETING_DISABLED", 503, "オンライン会議は現在利用できません。"); }
function active(meeting: typeof meetings.$inferSelect) {
 if (meeting.liveEndedAt || meeting.status === "completed") throw new BusinessError("MEETING_ALREADY_ENDED", 409, "この会議は終了しています。");
 if (!meeting.liveStartedAt || meeting.status === "scheduled") throw new BusinessError("MEETING_NOT_STARTED", 409, "会議の開始をお待ちください。");
 if (meeting.status !== "recording") throw new BusinessError("MEETING_INVALID_STATUS", 409, "この状態では会議に参加できません。");
}
export function startLiveMeeting(ctx: Context, db = getDb()) {
 return operation(ctx, "start", db, () => db.transaction(async (tx) => {
  const { access, meeting } = await accessAndLock(ctx, tx, true); enabled(); await limit(ctx, tx);
  if (meeting.liveEndedAt || !["scheduled", "recording"].includes(meeting.status)) throw new BusinessError("MEETING_INVALID_STATUS", 409, "この会議は開始できません。");
  await liveMeetingProvider.ensureRoom(getLiveKitRoomName(ctx.meetingId));
  validateMeetingTransition(meeting.status, "recording");
  await tx.update(meetings).set({ status: "recording", liveStartedAt: meeting.liveStartedAt ?? new Date() }).where(eq(meetings.id, ctx.meetingId));
  await audit(ctx, AUDIT_ACTIONS.MEETING_LIVE_START, tx, access); return { meetingId: ctx.meetingId, status: "recording" };
 }));
}
export function createMeetingToken(ctx: Context, db = getDb()) {
 return operation(ctx, "token", db, () => db.transaction(async (tx) => {
  const { access, meeting } = await accessAndLock(ctx, tx); enabled(); active(meeting); await limit(ctx, tx);
  const [user] = await tx.select({ name: users.name }).from(users).where(eq(users.id, ctx.userId));
  if (!user) throw new AccessError("UNAUTHENTICATED");
  const roomName = getLiveKitRoomName(ctx.meetingId); await liveMeetingProvider.ensureRoom(roomName);
  const result = await liveMeetingProvider.createParticipantToken({ roomName, identity: getLiveKitIdentity(ctx.userId), displayName: user.name, role: access.role });
  await audit(ctx, AUDIT_ACTIONS.MEETING_LIVE_TOKEN_ISSUE, tx, access); return { ...result, meetingId: ctx.meetingId, canPublish: access.role !== "viewer" };
 }));
}
export function joinLiveMeeting(ctx: Context, db = getDb()) {
 return operation(ctx, "join", db, () => db.transaction(async (tx) => {
  const { access, meeting } = await accessAndLock(ctx, tx); enabled(); active(meeting); await limit(ctx, tx);
  if (!await liveMeetingProvider.hasParticipant(getLiveKitRoomName(ctx.meetingId), getLiveKitIdentity(ctx.userId))) throw new BusinessError("MEETING_JOIN_FORBIDDEN", 409, "会議への接続後に参加を記録してください。");
  const where = and(eq(meetingParticipants.meetingId, ctx.meetingId), eq(meetingParticipants.userId, ctx.userId));
  const [current] = await tx.select().from(meetingParticipants).where(where);
  const [user] = await tx.select({ name: users.name }).from(users).where(eq(users.id, ctx.userId));
  if (current) await tx.update(meetingParticipants).set({ joinedAt: current.joinedAt && !current.leftAt ? current.joinedAt : new Date(), leftAt: null }).where(where);
  else await tx.insert(meetingParticipants).values({ meetingId: ctx.meetingId, userId: ctx.userId, displayName: user.name, role: "participant", joinedAt: new Date() });
  await audit(ctx, AUDIT_ACTIONS.MEETING_LIVE_JOIN, tx, access); return { meetingId: ctx.meetingId, joined: true };
 }));
}
export function leaveLiveMeeting(ctx: Context, db = getDb()) {
 return operation(ctx, "leave", db, () => db.transaction(async (tx) => {
  const { access } = await accessAndLock(ctx, tx, false, true);
  await tx.update(meetingParticipants).set({ leftAt: new Date() }).where(and(eq(meetingParticipants.meetingId, ctx.meetingId), eq(meetingParticipants.userId, ctx.userId), isNotNull(meetingParticipants.joinedAt), isNull(meetingParticipants.leftAt)));
  await audit(ctx, AUDIT_ACTIONS.MEETING_LIVE_LEAVE, tx, access); return { meetingId: ctx.meetingId, left: true };
 }));
}
export function endLiveMeeting(ctx: Context, db = getDb()) {
 return operation(ctx, "end", db, async () => {
  // Persist end intent BEFORE the provider call: failure must never reopen Token issuance.
  await db.transaction(async (tx) => {
   const { access, meeting } = await accessAndLock(ctx, tx, true, true); await limit(ctx, tx);
   if (!meeting.liveStartedAt || (!meeting.liveEndedAt && meeting.status !== "recording")) throw new BusinessError("MEETING_INVALID_STATUS", 409, "オンライン会議が開始されていません。");
   if (!meeting.liveEndedAt) await tx.update(meetings).set({ liveEndedAt: new Date() }).where(eq(meetings.id, ctx.meetingId));
   await audit(ctx, AUDIT_ACTIONS.MEETING_LIVE_END_REQUEST, tx, access);
  });
  return db.transaction(async (tx) => {
   const { access, meeting } = await accessAndLock(ctx, tx, true, true);
   await liveMeetingProvider.endRoom(getLiveKitRoomName(ctx.meetingId));
   // A later AI run may already have moved the ended Meeting to processing/failed.
   if (meeting.status === "recording") {
    validateMeetingTransition(meeting.status, "completed");
    await tx.update(meetings).set({ status: "completed" }).where(eq(meetings.id, ctx.meetingId));
   }
   await tx.update(meetingParticipants).set({ leftAt: meeting.liveEndedAt ?? new Date() }).where(and(eq(meetingParticipants.meetingId, ctx.meetingId), isNotNull(meetingParticipants.joinedAt), isNull(meetingParticipants.leftAt)));
   await audit(ctx, AUDIT_ACTIONS.MEETING_LIVE_END, tx, access); return { meetingId: ctx.meetingId, status: meeting.status === "recording" ? "completed" : meeting.status };
  });
 });
}
/** Untrusted client telemetry only; never changes authorization, attendance, or Meeting state. */
export function recordLiveConnectionEvent(ctx: Context, input: unknown, db = getDb()) {
 const event = liveConnectionEventSchema.safeParse(input);
 if (!event.success) throw new BusinessError("VALIDATION_ERROR", 400, "接続状態を確認してください。");
 return operation(ctx, `connection.${event.data.state}`, db, () => db.transaction(async (tx) => {
  const { access, meeting } = await accessAndLock(ctx, tx, false, true); await limit(ctx, tx);
  if (!meeting.liveStartedAt) throw new BusinessError("MEETING_NOT_STARTED", 409, "会議が開始されていません。");
  await writeAuditLog({ organizationId: access.organizationId, userId: ctx.userId, action: AUDIT_ACTIONS.MEETING_LIVE_CONNECTION, resourceType: "meeting", resourceId: ctx.meetingId, metadata: { meetingId: ctx.meetingId, projectId: access.projectId, requestId: ctx.requestId, connectionState: event.data.state } }, tx);
  return { recorded: true };
 }));
}
