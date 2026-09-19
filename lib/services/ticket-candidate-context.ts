import "server-only";
import { and, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";
import { BusinessError } from "@/lib/api/errors";
import { getMinutes, minutesDocument } from "./meeting-minutes-service";
import { loadMeetingAIContext } from "./meeting-ai-context";
import { validateMinutes } from "@/lib/ai/validators/minutes-business-validator";
export async function loadCandidateContext(userId: string, meetingId: string, minutesId: string, db: Pick<ReturnType<typeof getDb>, "transaction"> = getDb()) {
 return db.transaction(async (tx) => {
  const context = await loadMeetingAIContext(userId, meetingId, tx);
  const minutes = await getMinutes(userId, minutesId, tx);
  if (minutes.meetingId !== meetingId) throw new BusinessError("AI_TICKET_EVIDENCE_INVALID", 422, "議事録と会議が一致しません。");
  if (minutes.status !== "approved") throw new BusinessError("MINUTES_NOT_APPROVED", 422, "承認済み議事録を選択してください。");
  const content = validateMinutes(minutesDocument(minutes), context, true);
  const ids = new Set([...content.decisions, ...content.action_items, ...content.issues, ...content.pending_items].flatMap((item) => item.source_evidence.map((e) => e.transcript_id)));
  const openTickets = await tx.select({ title: tickets.title, type: tickets.type, assigneeId: tickets.assigneeId, dueDate: tickets.dueDate }).from(tickets).where(and(eq(tickets.projectId, context.project.id), isNull(tickets.deletedAt), ne(tickets.status, "done"))).orderBy(tickets.id).limit(200);
  return { ...context, transcripts: context.transcripts.filter((t) => ids.has(t.id)), minutes: { id: minutes.id, version: minutes.version, ...content }, openTickets };
 });
}
export type CandidateContext = Awaited<ReturnType<typeof loadCandidateContext>>;
