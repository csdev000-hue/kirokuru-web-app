import { relations } from "drizzle-orm";
import { users } from "./users";
import { organizations, organizationMembers } from "./organizations";
import { projects, projectMembers } from "./projects";
import { meetings, meetingParticipants, meetingTranscripts, meetingRecordings, meetingMinutes } from "./meetings";
import { tickets, ticketCandidates, ticketComments } from "./tickets";
import { auditLogs } from "./audit";

export const usersRelations = relations(users, ({ many }) => ({
  organizationMemberships: many(organizationMembers),
  projectMemberships: many(projectMembers),
  assignedTickets: many(tickets, { relationName: "ticketAssignee" }),
  createdTickets: many(tickets, { relationName: "ticketCreator" }),
  createdMeetings: many(meetings, { relationName: "meetingCreator" }),
}));

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  creator: one(users, { fields: [organizations.createdBy], references: [users.id] }),
  members: many(organizationMembers),
  projects: many(projects),
  auditLogs: many(auditLogs),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, { fields: [organizationMembers.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [organizationMembers.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ many, one }) => ({
  organization: one(organizations, { fields: [projects.organizationId], references: [organizations.id] }),
  creator: one(users, { fields: [projects.createdBy], references: [users.id] }),
  members: many(projectMembers),
  tickets: many(tickets),
  meetings: many(meetings),
  candidates: many(ticketCandidates),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  user: one(users, { fields: [projectMembers.userId], references: [users.id] }),
}));

export const meetingsRelations = relations(meetings, ({ many, one }) => ({
  project: one(projects, { fields: [meetings.projectId], references: [projects.id] }),
  creator: one(users, { fields: [meetings.createdBy], references: [users.id], relationName: "meetingCreator" }),
  participants: many(meetingParticipants),
  transcripts: many(meetingTranscripts),
  recordings: many(meetingRecordings),
  minutes: many(meetingMinutes),
  candidates: many(ticketCandidates),
  tickets: many(tickets),
}));

export const meetingParticipantsRelations = relations(meetingParticipants, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingParticipants.meetingId], references: [meetings.id] }),
  user: one(users, { fields: [meetingParticipants.userId], references: [users.id] }),
}));

export const meetingTranscriptsRelations = relations(meetingTranscripts, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingTranscripts.meetingId], references: [meetings.id] }),
  speaker: one(users, { fields: [meetingTranscripts.speakerUserId], references: [users.id] }),
}));

export const meetingRecordingsRelations = relations(meetingRecordings, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingRecordings.meetingId], references: [meetings.id] }),
}));

export const meetingMinutesRelations = relations(meetingMinutes, ({ many, one }) => ({
  meeting: one(meetings, { fields: [meetingMinutes.meetingId], references: [meetings.id] }),
  creator: one(users, { fields: [meetingMinutes.createdBy], references: [users.id] }),
  candidates: many(ticketCandidates),
}));

export const ticketsRelations = relations(tickets, ({ many, one }) => ({
  project: one(projects, { fields: [tickets.projectId], references: [projects.id] }),
  assignee: one(users, { fields: [tickets.assigneeId], references: [users.id], relationName: "ticketAssignee" }),
  creator: one(users, { fields: [tickets.createdBy], references: [users.id], relationName: "ticketCreator" }),
  sourceMeeting: one(meetings, { fields: [tickets.sourceMeetingId], references: [meetings.id] }),
  sourceCandidate: one(ticketCandidates, { fields: [tickets.sourceCandidateId], references: [ticketCandidates.id], relationName: "ticketSourceCandidate" }),
  comments: many(ticketComments),
}));

export const ticketCandidatesRelations = relations(ticketCandidates, ({ one }) => ({
  project: one(projects, { fields: [ticketCandidates.projectId], references: [projects.id] }),
  meeting: one(meetings, { fields: [ticketCandidates.meetingId], references: [meetings.id] }),
  minutes: one(meetingMinutes, { fields: [ticketCandidates.minutesId], references: [meetingMinutes.id] }),
  assignee: one(users, { fields: [ticketCandidates.assigneeId], references: [users.id] }),
  registeredTicket: one(tickets, { fields: [ticketCandidates.registeredTicketId], references: [tickets.id], relationName: "candidateRegisteredTicket" }),
}));

export const ticketCommentsRelations = relations(ticketComments, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketComments.ticketId], references: [tickets.id] }),
  user: one(users, { fields: [ticketComments.userId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  organization: one(organizations, { fields: [auditLogs.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

