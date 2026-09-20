import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ticketCandidates, meetingMinutes } from "@/lib/db/schema";
import { requireTicketCandidateAccess } from "@/lib/permissions/resource";
import { AccessError } from "@/lib/permissions/errors";
/** Called only after Ticket authorization; separately checks the source tenant and reciprocal IDs. */
export async function getTicketSource(userId: string, ticket: { id: string; projectId: string; sourceCandidateId: string | null; sourceMeetingId: string | null }, db: Pick<ReturnType<typeof getDb>, "select"> = getDb()) {
 if (!ticket.sourceCandidateId && !ticket.sourceMeetingId) return null;
 if (!ticket.sourceCandidateId || !ticket.sourceMeetingId) throw new AccessError("RESOURCE_NOT_FOUND");
 await requireTicketCandidateAccess({ userId, candidateId: ticket.sourceCandidateId }, db);
 const [c] = await db.select().from(ticketCandidates).where(eq(ticketCandidates.id, ticket.sourceCandidateId));
 if (!c || c.projectId !== ticket.projectId || c.meetingId !== ticket.sourceMeetingId || c.registeredTicketId !== ticket.id || c.status !== "registered" || !c.minutesId) throw new AccessError("RESOURCE_NOT_FOUND");
 const [minutes] = await db.select({ version: meetingMinutes.version, meetingId: meetingMinutes.meetingId }).from(meetingMinutes).where(eq(meetingMinutes.id, c.minutesId));
 if (!minutes || minutes.meetingId !== c.meetingId) throw new AccessError("RESOURCE_NOT_FOUND");
 return { candidateId: c.id, meetingId: c.meetingId, minutesId: c.minutesId, minutesVersion: minutes.version };
}
