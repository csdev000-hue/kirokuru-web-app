import Link from "next/link";
import { requirePageUser } from "@/lib/auth/page";
import { getMeeting } from "@/lib/services/meeting-service";
import { getProject, listProjectMembers } from "@/lib/services/project-service";
import { listMinutes } from "@/lib/services/meeting-minutes-service";
import { listTicketCandidates, listCandidateGenerations } from "@/lib/services/ticket-candidate-service";
import { pageResource } from "@/lib/services/page-resource";
import { candidateQuerySchema } from "@/lib/validators/ticket-candidate";
import { CandidateReview, GenerateCandidates } from "@/components/ticket-candidates/review";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
 const user = await requirePageUser(); const { id } = await params; const meeting = await pageResource(() => getMeeting(user.id, id)); const parsed = candidateQuerySchema.safeParse(await searchParams);
 if (!parsed.success) return <main><h1>候補の表示条件を確認してください</h1><Link href={`/meetings/${id}/ticket-candidates`}>候補一覧へ</Link></main>;
 const [project, members, versions, candidates, generations] = await Promise.all([getProject(user.id, meeting.projectId), listProjectMembers(user.id, meeting.projectId), listMinutes(user.id, id), listTicketCandidates(user.id, id, parsed.data), listCandidateGenerations(user.id, id)]);
 const selected = parsed.data.minutesId ? versions.find((v) => v.id === parsed.data.minutesId) : versions.find((v) => v.status === "approved"); const canWrite = project.role !== "viewer" && project.status === "active";
 return <main><Link href={`/meetings/${id}`}>会議に戻る</Link><h1>AIチケット候補</h1><p>{meeting.title}</p><p>候補の内容と根拠を人が確認してください。承認だけでは正式チケットは作成されません。</p>
 <nav aria-label="生成元の議事録">{versions.filter((v) => v.status === "approved").map((v) => <p key={v.id}><Link href={`?minutesId=${v.id}`}>承認済み議事録 Version {v.version}</Link></p>)}</nav>
 {selected?.status === "approved" ? <><p>生成元: Version {selected.version}</p>{canWrite && <GenerateCandidates key={selected.id} meetingId={id} minutesId={selected.id} regenerate={generations.some((g) => g.minutesId === selected.id && g.status === "completed")} />}</> : <p>生成には承認済み議事録が必要です。<Link href={`/meetings/${id}/minutes`}>議事録を確認</Link></p>}
 <nav aria-label="候補の状態">{([['', 'すべて'], ['pending', '確認待ち'], ['approved', '承認済み'], ['rejected', '却下済み']] as const).map(([status, label]) => <p key={status}><Link href={`?${new URLSearchParams({ ...(parsed.data.minutesId ? { minutesId: parsed.data.minutesId } : {}), ...(status ? { status } : {}) })}`}>{label}</Link></p>)}</nav>
 {candidates.length ? <><p>{candidates.length}件の候補</p>{candidates.map(({ createdAt, updatedAt, ...c }) => <CandidateReview key={`${c.id}-${updatedAt.toISOString()}-${createdAt.toISOString()}`} candidate={c} members={members.map(({ userId, name }) => ({ userId, name }))} canWrite={canWrite} />)}</> : <p>AIチケット候補はまだありません。生成結果が0件の場合もここに表示されます。</p>}
 </main>;
}
