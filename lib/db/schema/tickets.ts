import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, text, date, timestamp, numeric, jsonb, check, index, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { users } from "./users";
import { projects } from "./projects";
import { meetings, meetingMinutes } from "./meetings";
import { createdAt, updatedAt } from "./shared";

export const tickets = pgTable("tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "restrict" }),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 30, enum: ["task", "issue", "decision", "followup"] }).notNull().default("task"),
  status: varchar("status", { length: 30, enum: ["todo", "in_progress", "done", "blocked"] }).notNull().default("todo"),
  priority: varchar("priority", { length: 20, enum: ["low", "medium", "high", "urgent"] }).notNull().default("medium"),
  assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  dueDate: date("due_date", { mode: "string" }),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  sourceMeetingId: uuid("source_meeting_id").references(() => meetings.id, { onDelete: "restrict" }),
  sourceCandidateId: uuid("source_candidate_id").unique().references((): AnyPgColumn => ticketCandidates.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [
  check("tickets_type_check", sql`${t.type} in ('task', 'issue', 'decision', 'followup')`),
  check("tickets_status_check", sql`${t.status} in ('todo', 'in_progress', 'done', 'blocked')`),
  check("tickets_priority_check", sql`${t.priority} in ('low', 'medium', 'high', 'urgent')`),
  index("idx_tickets_project_status").on(t.projectId, t.status),
  index("idx_tickets_project_assignee").on(t.projectId, t.assigneeId),
  index("idx_tickets_project_deleted").on(t.projectId, t.deletedAt),
  index("idx_tickets_due_date").on(t.dueDate),
]);

export const candidateGenerations = pgTable("candidate_generations", {
  id: uuid("id").primaryKey().defaultRandom(),
  minutesId: uuid("minutes_id").notNull().references(() => meetingMinutes.id, { onDelete: "restrict" }),
  requestKey: uuid("request_key").notNull(),
  leaseToken: uuid("lease_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 20, enum: ["processing", "completed", "failed"] }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("uq_candidate_generation_request").on(t.minutesId, t.requestKey),
  uniqueIndex("uq_candidate_generation_processing").on(t.minutesId).where(sql`${t.status} = 'processing'`),
  check("candidate_generations_status_check", sql`${t.status} in ('processing', 'completed', 'failed')`),
]);

export const ticketCandidates = pgTable("ticket_candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "restrict" }),
  meetingId: uuid("meeting_id").notNull().references(() => meetings.id, { onDelete: "restrict" }),
  generationId: uuid("generation_id").references(() => candidateGenerations.id, { onDelete: "restrict" }),
  minutesId: uuid("minutes_id").references(() => meetingMinutes.id, { onDelete: "restrict" }),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 30, enum: ["task", "issue", "followup"] }).notNull().default("task"),
  priority: varchar("priority", { length: 20, enum: ["low", "medium", "high", "urgent"] }),
  assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  dueDate: date("due_date", { mode: "string" }),
  sourceTranscriptIds: jsonb("source_transcript_ids").$type<string[]>().default([]),
  sourceQuote: text("source_quote"),
  confidence: numeric("confidence", { precision: 5, scale: 4 }),
  status: varchar("status", { length: 20, enum: ["pending", "approved", "rejected", "registered"] }).notNull().default("pending"),
  registeredTicketId: uuid("registered_ticket_id").unique().references((): AnyPgColumn => tickets.id, { onDelete: "restrict" }),
  aiModel: varchar("ai_model", { length: 2048 }),
  promptVersion: varchar("prompt_version", { length: 50 }),
  schemaVersion: varchar("schema_version", { length: 50 }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  check("ticket_candidates_type_check", sql`${t.type} in ('task', 'issue', 'followup')`),
  check("ticket_candidates_priority_check", sql`${t.priority} in ('low', 'medium', 'high', 'urgent')`),
  check("ticket_candidates_status_check", sql`${t.status} in ('pending', 'approved', 'rejected', 'registered')`),
  check("ticket_candidates_confidence_check", sql`${t.confidence} >= 0 and ${t.confidence} <= 1`),
  index("idx_candidates_meeting_status").on(t.meetingId, t.status),
  index("idx_candidates_project_status").on(t.projectId, t.status),
]);

export const ticketComments = pgTable("ticket_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id").notNull().references(() => tickets.id, { onDelete: "restrict" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  content: text("content").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("idx_comments_ticket").on(t.ticketId)]);
export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type TicketCandidate = typeof ticketCandidates.$inferSelect;
export type NewTicketCandidate = typeof ticketCandidates.$inferInsert;
export type TicketComment = typeof ticketComments.$inferSelect;
export type NewTicketComment = typeof ticketComments.$inferInsert;
