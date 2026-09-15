import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { tickets, meetings, meetingMinutes, ticketCandidates } from "@/lib/db/schema";
import { AccessError } from "./errors";
import { requireProjectRole } from "./project";
import { PROJECT_ROLES, type ProjectRole } from "./roles";

type AccessInput = { userId: string; minimumRole?: ProjectRole };
function validId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new AccessError("RESOURCE_NOT_FOUND");
}
async function authorize(input: AccessInput, resource: { id: string; projectId: string } | undefined, db: Pick<ReturnType<typeof getDb>, "select">) {
  if (!resource) throw new AccessError("RESOURCE_NOT_FOUND");
  const membership = await requireProjectRole({ userId: input.userId, projectId: resource.projectId }, input.minimumRole ?? PROJECT_ROLES.VIEWER, db);
  return { resourceId: resource.id, ...membership };
}
export async function requireTicketAccess(input: AccessInput & { ticketId: string }, db: Pick<ReturnType<typeof getDb>, "select"> = getDb()) {
  validId(input.ticketId);
  const [row] = await db.select({ id: tickets.id, projectId: tickets.projectId }).from(tickets).where(and(eq(tickets.id, input.ticketId), isNull(tickets.deletedAt))).limit(1);
  return authorize(input, row, db);
}
export async function requireMeetingAccess(input: AccessInput & { meetingId: string }, db: Pick<ReturnType<typeof getDb>, "select"> = getDb()) {
  validId(input.meetingId);
  const [row] = await db.select({ id: meetings.id, projectId: meetings.projectId }).from(meetings).where(eq(meetings.id, input.meetingId)).limit(1);
  return authorize(input, row, db);
}
export async function requireMinutesAccess(input: AccessInput & { minutesId: string }, db: Pick<ReturnType<typeof getDb>, "select"> = getDb()) {
  validId(input.minutesId);
  const [row] = await db.select({ id: meetingMinutes.id, projectId: meetings.projectId }).from(meetingMinutes).innerJoin(meetings, eq(meetings.id, meetingMinutes.meetingId)).where(eq(meetingMinutes.id, input.minutesId)).limit(1);
  return authorize(input, row, db);
}
export async function requireTicketCandidateAccess(input: AccessInput & { candidateId: string }, db: Pick<ReturnType<typeof getDb>, "select"> = getDb()) {
  validId(input.candidateId);
  const [row] = await db.select({ id: ticketCandidates.id, projectId: ticketCandidates.projectId, minutesId: ticketCandidates.minutesId, meetingId: ticketCandidates.meetingId })
    .from(ticketCandidates).innerJoin(meetings, and(eq(meetings.id, ticketCandidates.meetingId), eq(meetings.projectId, ticketCandidates.projectId)))
    .where(eq(ticketCandidates.id, input.candidateId)).limit(1);
  if (row?.minutesId) {
    const [minutes] = await db.select({ id: meetingMinutes.id }).from(meetingMinutes).where(and(eq(meetingMinutes.id, row.minutesId), eq(meetingMinutes.meetingId, row.meetingId))).limit(1);
    if (!minutes) throw new AccessError("RESOURCE_NOT_FOUND");
  }
  return authorize(input, row, db);
}
