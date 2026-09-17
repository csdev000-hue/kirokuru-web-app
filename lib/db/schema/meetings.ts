import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, text, timestamp, numeric, integer, bigint, jsonb, check, index, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { projects } from "./projects";
import { createdAt, updatedAt, type JsonValue } from "./shared";

export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "restrict" }),
  minutesGenerationId: uuid("minutes_generation_id"),
  minutesGenerationExpiresAt: timestamp("minutes_generation_expires_at", { withTimezone: true }),
  title: varchar("title", { length: 200 }).notNull(),
  meetingDate: timestamp("meeting_date", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 20, enum: ["scheduled", "recording", "processing", "completed", "failed"] }).notNull().default("scheduled"),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  check("meetings_status_check", sql`${t.status} in ('scheduled', 'recording', 'processing', 'completed', 'failed')`),
  index("idx_meetings_project_date").on(t.projectId, t.meetingDate.desc()),
]);

// A guest has no user_id; a separate UUID identifies each participant reliably.
export const meetingParticipants = pgTable("meeting_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id").notNull().references(() => meetings.id, { onDelete: "restrict" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  role: varchar("role", { length: 30, enum: ["host", "participant"] }).notNull().default("participant"),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  leftAt: timestamp("left_at", { withTimezone: true }),
}, (t) => [
  check("meeting_participants_role_check", sql`${t.role} in ('host', 'participant')`),
  uniqueIndex("uq_participant_user").on(t.meetingId, t.userId).where(sql`${t.userId} is not null`),
  index("idx_participants_meeting").on(t.meetingId),
]);

export const meetingTranscripts = pgTable("meeting_transcripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id").notNull().references(() => meetings.id, { onDelete: "restrict" }),
  speakerUserId: uuid("speaker_user_id").references(() => users.id, { onDelete: "set null" }),
  speakerName: varchar("speaker_name", { length: 100 }).notNull(),
  startedAt: numeric("started_at", { precision: 12, scale: 3 }).notNull(),
  endedAt: numeric("ended_at", { precision: 12, scale: 3 }),
  text: text("text").notNull(),
  sequenceNo: integer("sequence_no").notNull(),
  createdAt: createdAt(),
}, (t) => [
  check("meeting_transcripts_time_order_check", sql`${t.endedAt} is null or ${t.endedAt} >= ${t.startedAt}`),
  check("meeting_transcripts_sequence_positive_check", sql`${t.sequenceNo} >= 1`),
  unique("uq_transcript_sequence").on(t.meetingId, t.sequenceNo),
  check("meeting_transcripts_started_at_check", sql`${t.startedAt} >= 0`),
  check("meeting_transcripts_ended_at_check", sql`${t.endedAt} >= 0`),
]);

export const meetingRecordings = pgTable("meeting_recordings", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id").notNull().references(() => meetings.id, { onDelete: "restrict" }),
  s3Key: text("s3_key").notNull().unique(),
  contentType: varchar("content_type", { length: 100 }).notNull(),
  fileSize: bigint("file_size", { mode: "bigint" }),
  durationSeconds: integer("duration_seconds"),
  status: varchar("status", { length: 20, enum: ["uploading", "uploaded", "processing", "completed", "failed"] }).notNull().default("uploading"),
  createdAt: createdAt(),
}, (t) => [
  check("meeting_recordings_status_check", sql`${t.status} in ('uploading', 'uploaded', 'processing', 'completed', 'failed')`),
  index("idx_recordings_meeting").on(t.meetingId),
]);

export const meetingMinutes = pgTable("meeting_minutes", {
  id: uuid("id").primaryKey().defaultRandom(),
  meetingId: uuid("meeting_id").notNull().references(() => meetings.id, { onDelete: "restrict" }),
  generationKey: uuid("generation_key"),
  version: integer("version").notNull().default(1),
  status: varchar("status", { length: 20, enum: ["draft", "review", "approved"] }).notNull().default("draft"),
  summary: text("summary"),
  decisions: jsonb("decisions").$type<JsonValue[]>().default([]),
  actionItems: jsonb("action_items").$type<JsonValue[]>().default([]),
  issues: jsonb("issues").$type<JsonValue[]>().default([]),
  pendingItems: jsonb("pending_items").$type<JsonValue[]>().default([]),
  aiModel: varchar("ai_model", { length: 2048 }),
  aiRawOutput: jsonb("ai_raw_output").$type<JsonValue>(),
  promptVersion: varchar("prompt_version", { length: 50 }),
  schemaVersion: varchar("schema_version", { length: 50 }),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("uq_minutes_generation_key").on(t.meetingId, t.generationKey).where(sql`${t.generationKey} is not null`),
  unique("uq_minutes_version").on(t.meetingId, t.version),
  check("meeting_minutes_version_check", sql`${t.version} >= 1`),
  check("meeting_minutes_status_check", sql`${t.status} in ('draft', 'review', 'approved')`),
]);

export type Meeting = typeof meetings.$inferSelect;
export type NewMeeting = typeof meetings.$inferInsert;
export type MeetingParticipant = typeof meetingParticipants.$inferSelect;
export type NewMeetingParticipant = typeof meetingParticipants.$inferInsert;
export type MeetingTranscript = typeof meetingTranscripts.$inferSelect;
export type NewMeetingTranscript = typeof meetingTranscripts.$inferInsert;
export type MeetingRecording = typeof meetingRecordings.$inferSelect;
export type NewMeetingRecording = typeof meetingRecordings.$inferInsert;
export type MeetingMinutes = typeof meetingMinutes.$inferSelect;
export type NewMeetingMinutes = typeof meetingMinutes.$inferInsert;
