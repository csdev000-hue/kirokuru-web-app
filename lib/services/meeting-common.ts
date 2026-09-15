import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { meetings, projectMembers, organizationMembers, users } from "@/lib/db/schema";
import { requireMeetingAccess } from "@/lib/permissions/resource";
import { AccessError } from "@/lib/permissions/errors";
import { BusinessError } from "@/lib/api/errors";
import { lockActiveProject } from "./ticket-service";
import { editableMeeting, type MeetingStatus } from "@/lib/validators/meeting";
export type MeetingReadDb = Pick<ReturnType<typeof getDb>, "select">;
export function meetingValidation<T>(schema: z.ZodType<T>, input: unknown): T {
 const parsed = schema.safeParse(input);
 if (!parsed.success) throw new BusinessError("VALIDATION_ERROR", 422, "入力内容・日時・発言順を確認してください。");
 return parsed.data;
}
export async function lockMeeting(userId: string, meetingId: string, db: MeetingReadDb, editing = true) {
 const access = await requireMeetingAccess({ userId, meetingId, minimumRole: "member" }, db);
 await lockActiveProject(access.projectId, db);
 const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId)).for("update");
 if (!meeting) throw new AccessError("RESOURCE_NOT_FOUND");
 if (editing) assertMeetingEditable(meeting.status);
 return { access, meeting };
}
export function assertMeetingEditable(status: MeetingStatus) {
 if (!editableMeeting(status)) throw new BusinessError("MEETING_READ_ONLY", 409, "処理中・完了済みの会議は編集できません。");
}
export function contextMembers(projectId: string, organizationId: string, db: MeetingReadDb) {
 return db.select({ userId: users.id, name: users.name, role: projectMembers.role }).from(projectMembers).innerJoin(users, eq(users.id, projectMembers.userId)).innerJoin(organizationMembers, and(eq(organizationMembers.userId, projectMembers.userId), eq(organizationMembers.organizationId, organizationId))).where(eq(projectMembers.projectId, projectId));
}
export function rethrowMeetingConstraint(error: unknown): never {
 // Drizzle wraps postgres errors; use only known constraint identifiers, never DB messages.
 let cause: unknown = error;
 for (let i = 0; i < 4 && cause && typeof cause === "object"; i++) {
  const value = cause as { code?: string; constraint_name?: string; cause?: unknown };
  if (value.code === "23505" && value.constraint_name === "uq_transcript_sequence") throw new BusinessError("TRANSCRIPT_SEQUENCE_CONFLICT", 409, "この会議の発言順が重複しています。");
  if (value.code === "23505" && value.constraint_name === "uq_participant_user") throw new BusinessError("PARTICIPANT_EXISTS", 409, "このユーザーは参加者に登録済みです。");
  cause = value.cause;
 }
 throw error;
}
