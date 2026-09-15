import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { meetings, projects, meetingParticipants, meetingTranscripts } from "@/lib/db/schema";
import { requireMeetingAccess } from "@/lib/permissions/resource";
import { BusinessError } from "@/lib/api/errors";
import { contextMembers } from "./meeting-common";
import { transcriptOutput } from "./meeting-transcript-service";
/** Server-only, authorized complete snapshot. No caller-provided context and no AI/provider call. */
export async function loadMeetingAIContext(userId: string, meetingId: string, db = getDb()) {
 return db.transaction(async (tx) => {
  const access = await requireMeetingAccess({ userId, meetingId, minimumRole: "member" }, tx);
  const [meeting] = await tx.select({ id: meetings.id, projectId: meetings.projectId, title: meetings.title, meetingDate: meetings.meetingDate, status: meetings.status }).from(meetings).where(eq(meetings.id, meetingId));
  const [project] = await tx.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, access.projectId));
  const projectMembers = await contextMembers(access.projectId, access.organizationId, tx);
  const participants = await tx.select().from(meetingParticipants).where(eq(meetingParticipants.meetingId, meetingId)).orderBy(meetingParticipants.id);
  const transcripts = (await tx.select().from(meetingTranscripts).where(eq(meetingTranscripts.meetingId, meetingId)).orderBy(meetingTranscripts.sequenceNo)).map(transcriptOutput);
  const ids = new Set(projectMembers.map((m) => m.userId));
  if (participants.some((p) => p.userId && !ids.has(p.userId)) || transcripts.some((t) => t.speakerUserId && !ids.has(t.speakerUserId))) throw new BusinessError("INVALID_AI_CONTEXT", 409, "参加者・話者の所属整合性を確認してください。");
  return { meeting, project, projectMembers, participants, transcripts };
 }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
