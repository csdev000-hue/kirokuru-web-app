import type { CandidateContext } from "@/lib/services/ticket-candidate-context";
import { minutesUserPrompt } from "./minutes-user";
export function ticketCandidateUserPrompt(context: CandidateContext) {
 const base = JSON.parse(minutesUserPrompt(context));
 return JSON.stringify({ project: base.project, meeting: base.meeting, project_members: base.project_members, minutes: context.minutes, transcripts: base.transcripts, open_tickets: context.openTickets.map((t) => ({ title: t.title, type: t.type, assignee_id: t.assigneeId, due_date: t.dueDate })) });
}
