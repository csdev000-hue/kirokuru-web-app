import { z } from "zod";
import { sourceEvidenceSchema } from "./common";
export const TICKET_CANDIDATE_SCHEMA_VERSION = "ticket-candidate-schema-v1";
export const candidateType = z.enum(["task", "issue", "followup"]);
export const candidatePriority = z.enum(["low", "medium", "high", "urgent"]).nullable();
export const ticketCandidateAIItemSchema = z.object({
 client_candidate_id: z.string().regex(/^cand_[0-9]{3}$/),
 title: z.string().trim().min(1).max(300), description: z.string().trim().max(5000),
 type: candidateType, priority: candidatePriority,
 assignee: z.object({ user_id: z.uuid().nullable(), display_name: z.string().trim().min(1).max(100) }).strict().nullable(),
 due_date: z.iso.date().refine((v) => !v.startsWith("0000")).nullable(), confidence: z.number().min(0).max(1),
 source_evidence: z.array(sourceEvidenceSchema.extend({ reason: z.string().min(1).max(500).optional() }).strict()).min(1).max(10),
}).strict();
export const ticketCandidateAIResultSchema = z.object({ schema_version: z.literal(TICKET_CANDIDATE_SCHEMA_VERSION), language: z.literal("ja"), meeting_id: z.uuid(), candidates: z.array(ticketCandidateAIItemSchema).max(50) }).strict();
export type TicketCandidateAIItem = z.infer<typeof ticketCandidateAIItemSchema>;
