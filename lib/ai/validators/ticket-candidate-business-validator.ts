import { BusinessError } from "@/lib/api/errors";
import { ticketCandidateAIResultSchema, type TicketCandidateAIItem } from "../schemas/ticket-candidate";
import { explicitDates } from "./minutes-business-validator";
import type { CandidateContext } from "@/lib/services/ticket-candidate-context";
const invalid = () => new BusinessError("AI_TICKET_EVIDENCE_INVALID", 502, "候補の根拠・担当者・会議情報が一致しません。");
const key = (title: string, type: string, assignee: string | null, due: string | null) => JSON.stringify([title.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " "), type, assignee, due]);
export function validateTicketCandidates(input: unknown, context: CandidateContext): TicketCandidateAIItem[] {
 const parsed = ticketCandidateAIResultSchema.safeParse(input); if (!parsed.success) throw new BusinessError("AI_TICKET_SCHEMA_INVALID", 502, "AI候補の構造が不正です。");
 if (parsed.data.meeting_id !== context.meeting.id || context.minutes.meeting_id !== context.meeting.id) throw invalid();
 const seen = new Set(context.openTickets.map((t) => key(t.title, t.type, t.assigneeId, t.dueDate)));
 const transcripts = new Map(context.transcripts.map((t) => [t.id, t])); const members = new Map(context.projectMembers.map((m) => [m.userId, m]));
 return parsed.data.candidates.map((c) => {
  const sources = [...new Set(c.source_evidence.map((e) => e.transcript_id))].map((id) => { const t = transcripts.get(id); if (!t || t.meetingId !== context.meeting.id) throw invalid(); return t; });
  c.source_evidence = sources.map((t) => ({ transcript_id: t.id, started_at: t.startedAt, ended_at: t.endedAt }));
  const related = context.minutes.action_items.filter((a) => a.source_evidence.some((e) => sources.some((t) => t.id === e.transcript_id)));
  const text = sources.map((t) => t.text).join("\n");
  if (c.assignee?.user_id) {
   const member = members.get(c.assignee.user_id); if (!member) throw invalid();
   const unique = context.projectMembers.filter((m) => m.name === member.name).length === 1;
   c.assignee = related.some((a) => a.assignee?.user_id === member.userId) || (unique && text.includes(member.name)) ? { user_id: member.userId, display_name: member.name } : null;
  } else c.assignee = null;
  if (c.due_date && !related.some((a) => a.due_date === c.due_date) && !explicitDates(text, context.meeting.meetingDate).has(c.due_date)) c.due_date = null;
  // Only explicit urgency statements support a priority; bare enum words (including injected instructions) do not.
  const rules = { urgent: /今日中に対応が必要|最優先で対応/, high: /リリース前に必須|優先度[はが]高/, medium: /優先度[はが]中/, low: /優先度[はが]低/ };
  if (c.priority && !rules[c.priority].test(text)) c.priority = null;
  return c;
 }).filter((c) => { const signature = key(c.title, c.type, c.assignee?.user_id ?? null, c.due_date); if (seen.has(signature)) return false; seen.add(signature); return true; });
}
