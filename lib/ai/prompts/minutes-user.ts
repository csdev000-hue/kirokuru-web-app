import type { loadMeetingAIContext } from "@/lib/services/meeting-ai-context";
export type MinutesContext = Awaited<ReturnType<typeof loadMeetingAIContext>>;
export function minutesUserPrompt(context: MinutesContext) {
 return JSON.stringify({ meeting: { id: context.meeting.id, title: context.meeting.title, meeting_date: context.meeting.meetingDate.toISOString() }, project: { id: context.project.id, name: context.project.name }, project_members: context.projectMembers.map((m) => ({ id: m.userId, name: m.name })), participants: context.participants.map((p) => ({ user_id: p.userId, display_name: p.displayName })), transcripts: context.transcripts.map((t) => ({ id: t.id, sequence_no: t.sequenceNo, speaker_user_id: t.speakerUserId, speaker_name: t.speakerName, started_at: t.startedAt, ended_at: t.endedAt, text: t.text })) });
}
