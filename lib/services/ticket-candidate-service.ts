import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { ticketCandidates, meetingMinutes, candidateGenerations, meetingTranscripts } from "@/lib/db/schema";
import { requireMeetingAccess, requireTicketCandidateAccess } from "@/lib/permissions/resource";
import { getProjectMembership } from "@/lib/permissions/project";
import { AccessError } from "@/lib/permissions/errors";
import { BusinessError, validationError } from "@/lib/api/errors";
import { writeAuditLog } from "@/lib/security/audit";
import { candidateContentSchema, candidateQuerySchema, updateCandidateSchema } from "@/lib/validators/ticket-candidate";
import { lockActiveProject } from "./ticket-service";
import { listMinutesEvidence } from "./meeting-minutes-service";
import { loadCandidateContext } from "./ticket-candidate-context";
type ReadDb = Pick<ReturnType<typeof getDb>, "select">;
export async function getTicketCandidate(userId: string, candidateId: string, db: ReadDb = getDb()) {
 await requireTicketCandidateAccess({ userId, candidateId }, db);
 const [row] = await db.select().from(ticketCandidates).where(eq(ticketCandidates.id, candidateId));
 if (!row || !row.minutesId) throw new AccessError("RESOURCE_NOT_FOUND");
 const transcripts = await listMinutesEvidence(userId, row.meetingId, db);
 const [minutes] = await db.select({version:meetingMinutes.version}).from(meetingMinutes).where(and(eq(meetingMinutes.id,row.minutesId),eq(meetingMinutes.meetingId,row.meetingId)));
 if(!minutes) throw new AccessError("RESOURCE_NOT_FOUND");
 return candidateOutput(row,minutes.version,transcripts);
}
function candidateOutput(row: typeof ticketCandidates.$inferSelect, version: number, transcripts: Awaited<ReturnType<typeof listMinutesEvidence>>) {
 if(!row.minutesId)throw new AccessError("RESOURCE_NOT_FOUND");
 const content = candidateContentSchema.parse({ title: row.title, description: row.description, type: row.type, priority: row.priority, assigneeId: row.assigneeId, dueDate: row.dueDate });
 const confidence = row.confidence === null ? null : z.number().min(0).max(1).parse(Number(row.confidence));
 const ids = z.array(z.uuid()).min(1).max(10).parse(row.sourceTranscriptIds);
 const sourceEvidence = ids.map((id) => { const t = transcripts.find((t) => t.id === id); if (!t) throw new BusinessError("AI_TICKET_EVIDENCE_INVALID", 422, "候補の根拠を確認できません。"); return { transcriptId: id, startedAt: t.startedAt, endedAt: t.endedAt, speakerName: t.speakerName, sequenceNo: t.sequenceNo, text: t.text }; });
 return { id: row.id, projectId: row.projectId, meetingId: row.meetingId, minutesId: row.minutesId, minutesVersion: version, generationId: row.generationId, ...content, confidence, status: row.status, sourceEvidence, sourceQuote: sourceEvidence[0]?.text.slice(0, 300) ?? null, aiModel: row.aiModel, promptVersion: row.promptVersion, schemaVersion: row.schemaVersion, registeredTicketId: row.registeredTicketId, createdAt: row.createdAt, updatedAt: row.updatedAt };
}
export async function listTicketCandidates(userId: string, meetingId: string, input: unknown = {}, db: ReadDb = getDb()) {
 const access = await requireMeetingAccess({userId,meetingId},db);
 const parsed=candidateQuerySchema.safeParse(input);if(!parsed.success)throw validationError();const f=parsed.data;
 const rows=await db.select({candidate:ticketCandidates,version:meetingMinutes.version}).from(ticketCandidates)
 .innerJoin(meetingMinutes,and(eq(meetingMinutes.id,ticketCandidates.minutesId),eq(meetingMinutes.meetingId,ticketCandidates.meetingId)))
 .where(and(eq(ticketCandidates.projectId,access.projectId),eq(ticketCandidates.meetingId,meetingId),f.status?eq(ticketCandidates.status,f.status):undefined,f.minutesId?eq(ticketCandidates.minutesId,f.minutesId):undefined,f.type?eq(ticketCandidates.type,f.type):undefined,f.priority?eq(ticketCandidates.priority,f.priority):undefined,f.assigneeId?eq(ticketCandidates.assigneeId,f.assigneeId):undefined))
 .orderBy(desc(ticketCandidates.createdAt),ticketCandidates.id).limit(f.limit).offset((f.page-1)*f.limit);
 if(!rows.length)return [];
 const ids=[...new Set(rows.flatMap(({candidate})=>z.array(z.uuid()).min(1).max(10).parse(candidate.sourceTranscriptIds)))];
 const evidence=await db.select({id:meetingTranscripts.id,sequenceNo:meetingTranscripts.sequenceNo,speakerName:meetingTranscripts.speakerName,startedAt:meetingTranscripts.startedAt,endedAt:meetingTranscripts.endedAt,text:meetingTranscripts.text}).from(meetingTranscripts).where(and(eq(meetingTranscripts.meetingId,meetingId),inArray(meetingTranscripts.id,ids)));
 const transcripts=evidence.map(r=>({...r,startedAt:Number(r.startedAt),endedAt:r.endedAt===null?null:Number(r.endedAt)}));
 return rows.map(({candidate,version})=>candidateOutput(candidate,version,transcripts));
}
async function mutateCandidate(userId: string, candidateId: string, input: unknown, action: "update" | "approve" | "reject", db = getDb()) {
 const parsed = updateCandidateSchema.safeParse(input); if (action === "update" && !parsed.success) throw validationError();
 return db.transaction(async (tx) => {
  const access = await requireTicketCandidateAccess({ userId, candidateId, minimumRole: "member" }, tx); await lockActiveProject(access.projectId, tx);
  const [row] = await tx.select().from(ticketCandidates).where(eq(ticketCandidates.id, candidateId)).for("update");
  if (row.status !== "pending" || row.registeredTicketId) throw new BusinessError(row.status === "approved" ? "TICKET_CANDIDATE_ALREADY_APPROVED" : row.status === "rejected" ? "TICKET_CANDIDATE_ALREADY_REJECTED" : "TICKET_CANDIDATE_INVALID_STATUS", 409, "この候補は編集・承認・却下できない状態です。");
  const changes = action === "update" && parsed.success ? parsed.data : {};
  const content = candidateContentSchema.parse({ title: row.title, description: row.description, type: row.type, priority: row.priority, assigneeId: row.assigneeId, dueDate: row.dueDate, ...changes });
  if (content.assigneeId && !await getProjectMembership({ userId: content.assigneeId, projectId: access.projectId }, tx)) throw new BusinessError("INVALID_ASSIGNEE", 422, "担当者はProject Memberから選択してください。");
  if (!row.minutesId) throw new BusinessError("MINUTES_NOT_APPROVED", 422, "元の承認済み議事録を確認してください。");
  const context = await loadCandidateContext(userId, row.meetingId, row.minutesId, tx);
  const ids = z.array(z.uuid()).min(1).max(10).safeParse(row.sourceTranscriptIds);
  if (!ids.success || ids.data.some((id) => !context.transcripts.some((t) => t.id === id))) throw new BusinessError("AI_TICKET_EVIDENCE_INVALID", 422, "候補の根拠が不正です。");
  if (row.confidence !== null && !z.number().min(0).max(1).safeParse(Number(row.confidence)).success) throw validationError();
  await tx.update(ticketCandidates).set({ ...content, status: action === "approve" ? "approved" : action === "reject" ? "rejected" : "pending" }).where(and(eq(ticketCandidates.id, candidateId), eq(ticketCandidates.status, "pending")));
  const changedFields = (["title", "description", "type", "priority", "assigneeId", "dueDate"] as const).filter((key) => key in changes);
  await writeAuditLog({ organizationId: access.organizationId, userId, action: `ticket_candidate.${action}`, resourceType: "candidate", resourceId: candidateId, metadata: { meetingId: row.meetingId, minutesId: row.minutesId, changedFields: action === "update" ? changedFields : ["status"] } }, tx);
  return getTicketCandidate(userId, candidateId, tx);
 });
}
export const updateTicketCandidate = (userId: string, id: string, input: unknown, db = getDb()) => mutateCandidate(userId, id, input, "update", db);
export const approveTicketCandidate = (userId: string, id: string, db = getDb()) => mutateCandidate(userId, id, {}, "approve", db);
export const rejectTicketCandidate = (userId: string, id: string, db = getDb()) => mutateCandidate(userId, id, {}, "reject", db);

export async function listCandidateGenerations(userId: string, meetingId: string, db: ReadDb = getDb()) {
 await requireMeetingAccess({ userId, meetingId }, db);
 return db.select({ id: candidateGenerations.id, minutesId: candidateGenerations.minutesId, status: candidateGenerations.status, createdAt: candidateGenerations.createdAt }).from(candidateGenerations).innerJoin(meetingMinutes, eq(meetingMinutes.id, candidateGenerations.minutesId)).where(eq(meetingMinutes.meetingId, meetingId)).orderBy(desc(candidateGenerations.createdAt));
}
