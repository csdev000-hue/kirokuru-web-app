import * as s from "../../lib/db/schema";
import { assertTestDatabase, type TestDatabase } from "../helpers/postgres";

/** Test-only fixture; accepts only a live context issued by our isolated harness. */
export async function seedTestDatabase(context: TestDatabase) {
  assertTestDatabase(context);
  return context.db.transaction(async (db) => {
    const [ownerA, memberA, viewerA, ownerB] = await db.insert(s.users).values([
      { email: "owner-a@example.invalid", name: "Owner A" },
      { email: "member-a@example.invalid", name: "Member A" },
      { email: "viewer-a@example.invalid", name: "Viewer A" },
      { email: "owner-b@example.invalid", name: "Owner B" },
    ]).returning();
    const [organizationA, organizationB] = await db.insert(s.organizations).values([
      { name: "Organization A", createdBy: ownerA.id },
      { name: "Organization B", createdBy: ownerB.id },
    ]).returning();
    await db.insert(s.organizationMembers).values([
      { organizationId: organizationA.id, userId: ownerA.id, role: "owner" },
      { organizationId: organizationA.id, userId: memberA.id, role: "member" },
      { organizationId: organizationA.id, userId: viewerA.id, role: "member" },
      { organizationId: organizationB.id, userId: ownerB.id, role: "owner" },
    ]);
    const [projectA, projectB] = await db.insert(s.projects).values([
      { name: "Project A", organizationId: organizationA.id, createdBy: ownerA.id },
      { name: "Project B", organizationId: organizationB.id, createdBy: ownerB.id },
    ]).returning();
    await db.insert(s.projectMembers).values([
      { projectId: projectA.id, userId: ownerA.id, role: "owner" },
      { projectId: projectA.id, userId: memberA.id, role: "member" },
      { projectId: projectA.id, userId: viewerA.id, role: "viewer" },
      { projectId: projectB.id, userId: ownerB.id, role: "owner" },
    ]);
    const [meetingA, meetingB] = await db.insert(s.meetings).values([
      { projectId: projectA.id, title: "Meeting A", meetingDate: new Date("2026-09-01T00:00:00Z"), createdBy: ownerA.id },
      { projectId: projectB.id, title: "Meeting B", meetingDate: new Date("2026-09-01T00:00:00Z"), createdBy: ownerB.id },
    ]).returning();
    await db.insert(s.meetingParticipants).values([
      { meetingId: meetingA.id, userId: ownerA.id, displayName: "Owner A", role: "host" },
      { meetingId: meetingA.id, displayName: "Guest" },
    ]);
    const [transcript] = await db.insert(s.meetingTranscripts).values({
      meetingId: meetingA.id, speakerUserId: memberA.id, speakerName: "Member A",
      startedAt: "0.000", endedAt: "1.500", text: "テスト用発言", sequenceNo: 1,
    }).returning();
    const [recording] = await db.insert(s.meetingRecordings).values({
      meetingId: meetingA.id, s3Key: "test/meeting-a/recording.webm", contentType: "audio/webm", fileSize: BigInt(1024),
    }).returning();
    const [minutes] = await db.insert(s.meetingMinutes).values({
      meetingId: meetingA.id, createdBy: ownerA.id, summary: "テスト用議事録",
    }).returning();
    const [generation] = await db.insert(s.candidateGenerations).values({ minutesId: minutes.id, requestKey: crypto.randomUUID(), leaseToken: crypto.randomUUID(), expiresAt: new Date(0), status: "completed" }).returning();
    const [candidate] = await db.insert(s.ticketCandidates).values({
      projectId: projectA.id, meetingId: meetingA.id, minutesId: minutes.id, generationId: generation.id, title: "テスト用候補",
      sourceTranscriptIds: [transcript.id], confidence: "0.5000",
    }).returning();
    const [ticket] = await db.insert(s.tickets).values({
      projectId: projectA.id, title: "手動チケット", createdBy: ownerA.id, assigneeId: memberA.id,
    }).returning();
    await db.insert(s.ticketComments).values({ ticketId: ticket.id, userId: memberA.id, content: "テストコメント" });
    await db.insert(s.auditLogs).values({
      organizationId: organizationA.id, userId: ownerA.id, action: "fixture.created", resourceType: "project", resourceId: projectA.id,
    });
    return { ownerA, memberA, viewerA, ownerB, organizationA, organizationB, projectA, projectB, meetingA, meetingB, transcript, recording, minutes, candidate, ticket };
  });
}
export type DatabaseFixture = Awaited<ReturnType<typeof seedTestDatabase>>;
