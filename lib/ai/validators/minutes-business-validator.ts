import { BusinessError } from "@/lib/api/errors";
import { minutesAIResultSchema, type MinutesAIResult, type MinutesItem, type ActionItem } from "../schemas/minutes";
import type { MinutesContext } from "../prompts/minutes-user";
import { todayInJapan } from "@/lib/utils/ticket-date";
const invalid = () => new BusinessError("AI_EVIDENCE_INVALID", 422, "議事録の根拠・担当者・会議情報が一致しません。");
export function explicitDates(text: string, meetingDate: Date) {
 const found = new Set(text.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []);
 for (const match of text.matchAll(/(\d{4})年(\d{1,2})月(\d{1,2})日/g)) found.add(`${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`);
 const base = new Date(`${todayInJapan(meetingDate)}T00:00:00Z`);
 const add = (days: number) => new Date(base.getTime() + days * 86400000).toISOString().slice(0, 10);
 if (text.includes("明日")) found.add(add(1));
 if (text.includes("来週金曜日")) found.add(add(((8 - base.getUTCDay()) % 7 || 7) + 4));
 if (text.includes("今月末")) found.add(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).toISOString().slice(0, 10));
 return found;
}
export function validateMinutes(input: unknown, context: MinutesContext, human = false): MinutesAIResult {
 const parsed = minutesAIResultSchema.safeParse(input); if (!parsed.success) throw new BusinessError("AI_SCHEMA_INVALID", 422, "議事録の構造が不正です。");
 const result = parsed.data; if (result.meeting_id !== context.meeting.id) throw invalid();
 const transcripts = new Map(context.transcripts.map((t) => [t.id, t])); const members = new Map(context.projectMembers.map((m) => [m.userId, m]));
 function item<T extends MinutesItem>(row: T): T {
  const evidence = new Map<string, MinutesItem["source_evidence"][number]>();
  for (const source of row.source_evidence) {
   const t = transcripts.get(source.transcript_id); if (!t || t.meetingId !== context.meeting.id) throw invalid();
   evidence.set(t.id, { transcript_id: t.id, started_at: t.startedAt, ended_at: t.endedAt });
  }
  return { ...row, source_evidence: [...evidence.values()] };
 }
 function unique<T extends MinutesItem>(rows: T[]) {
  const seen = new Set<string>(); return rows.filter((row) => { const action = row as T & Partial<ActionItem>; const key = JSON.stringify([row.title.normalize("NFKC").toLowerCase(), action.assignee?.user_id ?? null, action.due_date ?? null, row.source_evidence.map((e) => e.transcript_id).sort()]); if (seen.has(key)) return false; seen.add(key); return true; });
 }
 result.decisions = unique(result.decisions.map(item)); result.issues = unique(result.issues.map(item)); result.pending_items = unique(result.pending_items.map(item));
 result.action_items = unique(result.action_items.map((row) => {
  const action = item(row); const text = action.source_evidence.map((e) => transcripts.get(e.transcript_id)!.text).join("\n");
  if (action.assignee?.user_id) {
   const member = members.get(action.assignee.user_id); if (!member) throw invalid();
   action.assignee = human || text.includes(member.name) ? { user_id: member.userId, display_name: member.name } : null;
  } else if (action.assignee && !human && !text.includes(action.assignee.display_name)) action.assignee = null;
  if (action.due_date?.startsWith("0000")) throw invalid();
  if (!human && action.due_date && !explicitDates(text, context.meeting.meetingDate).has(action.due_date)) action.due_date = null;
  return action;
 }));
 return result;
}
