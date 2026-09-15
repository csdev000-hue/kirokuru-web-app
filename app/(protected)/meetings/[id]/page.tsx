import Link from "next/link";
import { requirePageUser } from "@/lib/auth/page";
import { getProject, listProjectMembers } from "@/lib/services/project-service";
import { getMeeting } from "@/lib/services/meeting-service";
import { listTranscripts } from "@/lib/services/meeting-transcript-service";
import { pageResource } from "@/lib/services/page-resource";
import { editableMeeting } from "@/lib/validators/meeting";
import { transcriptQuerySchema } from "@/lib/validators/meeting-transcript";
import { meetingTime, transcriptTimestamp } from "@/lib/utils/meeting-time";
import { MeetingForm, MeetingActions, ParticipantForm, RemoveParticipant, Attendance, TranscriptForm, RemoveTranscript } from "@/components/meetings/forms";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
 const user = await requirePageUser(); const { id } = await params; const meeting = await pageResource(() => getMeeting(user.id, id));
 const parsed = transcriptQuerySchema.safeParse(await searchParams);
 if (!parsed.success) return <main><h1>発言の表示条件を確認してください</h1><Link href={`/meetings/${id}`}>会議に戻る</Link></main>;
 const [project, members, transcriptPage] = await Promise.all([getProject(user.id, meeting.projectId), listProjectMembers(user.id, meeting.projectId), listTranscripts(user.id, id, parsed.data)]);
 const canWrite = project.role !== "viewer" && project.status === "active"; const editable = canWrite && editableMeeting(meeting.status); const transcriptEditable = editable && !meeting.minutes;
 return <main><Link href={`/projects/${meeting.projectId}/meetings`}>会議一覧へ</Link><h1>{meeting.title}</h1><p>{meetingTime(meeting.meetingDate)}（日本時間）· 状態: {meeting.status}</p>{meeting.status === "processing" && <p role="status">処理中の状態です。</p>}
 {editable && <details><summary>会議情報を編集</summary><MeetingForm key={meeting.updatedAt.toISOString()} projectId={meeting.projectId} meeting={{ id, title: meeting.title, meetingDate: meeting.meetingDate.toISOString() }} /></details>}
 {canWrite && <MeetingActions id={id} projectId={meeting.projectId} status={meeting.status} />}
 <section><h2>参加者</h2><ul>{meeting.participants.map((p) => <li key={p.id}><p>{p.displayName} · {p.role} · 参加: {p.joinedAt ? meetingTime(p.joinedAt) : "未記録"} · 退出: {p.leftAt ? meetingTime(p.leftAt) : "未記録"}</p>{editable && <details><summary>参加者を編集: {p.displayName}</summary><ParticipantForm meetingId={id} members={members} participant={p} /><RemoveParticipant meetingId={id} id={p.id} /></details>}</li>)}</ul>
 {editable && <><h3>参加者を追加</h3><ParticipantForm meetingId={id} members={members} />{meeting.participants.some((p) => p.userId === user.id) && <Attendance meetingId={id} />}</>}</section>
 <section><h2>文字起こし</h2><p>全{meeting.transcriptCount}件</p>{transcriptPage.data.length ? <ol>{transcriptPage.data.map((t) => <li key={t.id}><p>{transcriptTimestamp(t.startedAt)} {t.speakerName}（発言順 {t.sequenceNo}）</p><p className="user-content">{t.text}</p>{transcriptEditable && <details><summary>発言を編集: {t.sequenceNo}</summary><TranscriptForm meetingId={id} members={members} nextSequence={meeting.lastSequenceNo + 1} transcript={t} /><RemoveTranscript meetingId={id} id={t.id} /></details>}</li>)}</ol> : <p>文字起こしはまだありません</p>}
 <nav>{parsed.data.fromSequence > 1 && <Link href={`/meetings/${id}`}>先頭へ</Link>}{transcriptPage.meta.nextSequence && <Link href={`?fromSequence=${transcriptPage.meta.nextSequence}`}>次の発言</Link>}</nav>
 {transcriptEditable && <><h3>文字起こしを追加</h3><TranscriptForm key={meeting.lastSequenceNo} meetingId={id} members={members} nextSequence={meeting.lastSequenceNo + 1} /></>}</section>
 <section aria-label="関連情報">{meeting.recording && <p>録音データあり（{meeting.recording.status}）</p>}{meeting.minutes && <p>議事録データあり（version {meeting.minutes.version}）</p>}</section></main>;
}
