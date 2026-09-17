import Link from "next/link";
import { requirePageUser } from "@/lib/auth/page";
import { getMeeting } from "@/lib/services/meeting-service";
import { getProject, listProjectMembers } from "@/lib/services/project-service";
import { getMinutes, listMinutes, listMinutesEvidence } from "@/lib/services/meeting-minutes-service";
import { pageResource } from "@/lib/services/page-resource";
import { MinutesReview, GenerateMinutes } from "@/components/minutes/review";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string }> }) {
 const user = await requirePageUser(); const { id } = await params;
 const meeting = await pageResource(() => getMeeting(user.id, id));
 const [project, members, versions, evidence] = await Promise.all([getProject(user.id, meeting.projectId), listProjectMembers(user.id, meeting.projectId), listMinutes(user.id, id), listMinutesEvidence(user.id, id)]);
 const { version } = await searchParams; const selected = version === undefined ? versions[0] : versions.find((v) => String(v.version) === version);
 const minutes = selected ? await pageResource(() => getMinutes(user.id, selected.id)) : undefined;
 const canWrite = project.role !== "viewer" && project.status === "active";
 return <main><Link href={`/meetings/${id}`}>会議に戻る</Link><h1>AI議事録</h1><p>{meeting.title}</p><p>AIの出力を発言の根拠と照合し、人が確認してから承認してください。</p>
 <nav aria-label="議事録の履歴">{versions.map((v) => <p key={v.id}><Link href={`?version=${v.version}`}>Version {v.version} · {v.status}</Link></p>)}</nav>
 {canWrite && meeting.transcriptCount > 0 && meeting.status !== "recording" && <GenerateMinutes meetingId={id} regenerate={versions.length > 0} />}
 {!meeting.transcriptCount && <p>議事録の生成には文字起こしが必要です。</p>}
 {minutes ? <MinutesReview key={`${minutes.id}-${minutes.updatedAt.toISOString()}`} meetingId={id} minutes={{ id: minutes.id, version: minutes.version, status: minutes.status, summary: minutes.summary, decisions: minutes.decisions, actionItems: minutes.actionItems, issues: minutes.issues, pendingItems: minutes.pendingItems }} evidence={evidence} members={members.map(({ userId, name }) => ({ userId, name }))} canWrite={canWrite} /> : <p>{version ? "指定したVersionが見つかりません。" : "AI議事録はまだ生成されていません"}</p>}</main>;
}
