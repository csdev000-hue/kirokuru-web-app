import Link from "next/link";
import { requirePageUser } from "@/lib/auth/page";
import { getTicketCandidate } from "@/lib/services/ticket-candidate-service";
import { getProject, listProjectMembers } from "@/lib/services/project-service";
import { pageResource } from "@/lib/services/page-resource";
import { CandidateReview } from "@/components/ticket-candidates/review";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
 const user = await requirePageUser(); const { id } = await params; const { createdAt, updatedAt, ...candidate } = await pageResource(() => getTicketCandidate(user.id, id));
 const [project, members] = await Promise.all([getProject(user.id, candidate.projectId), listProjectMembers(user.id, candidate.projectId)]);
 return <main><Link href={`/meetings/${candidate.meetingId}/ticket-candidates`}>候補一覧へ</Link><h1>チケット候補の確認</h1><CandidateReview key={`${id}-${updatedAt.toISOString()}-${createdAt.toISOString()}`} candidate={candidate} members={members.map(({ userId, name }) => ({ userId, name }))} canWrite={project.role !== "viewer" && project.status === "active"} /></main>;
}
