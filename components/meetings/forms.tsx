"use client";
import { apiErrorMessage } from "@/lib/api/client-error";
import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { transitions, type MeetingStatus } from "@/lib/validators/meeting";
const messages: Record<string, string> = { UNAUTHENTICATED: "再度ログインしてください。", FORBIDDEN: "この操作は許可されていません。", RESOURCE_NOT_FOUND: "対象が見つかりません。", VALIDATION_ERROR: "入力内容・日時・発言順を確認してください。", INVALID_TRANSITION: "この状態への変更は許可されていません。", MEETING_READ_ONLY: "処理中・完了済みの会議は編集できません。", PROJECT_ARCHIVED: "アーカイブ済みプロジェクトは変更できません。", MEETING_NOT_EMPTY: "関連データが存在する会議は削除できません。", LAST_HOST_REQUIRED: "最後のhostは削除・降格できません。", PARTICIPANT_EXISTS: "このユーザーは登録済みです。", INVALID_PARTICIPANT: "参加者の所属を確認してください。", INVALID_SPEAKER: "話者の所属を確認してください。", TRANSCRIPT_SEQUENCE_CONFLICT: "発言順が重複しています。別の番号を指定してください。", TRANSCRIPT_REFERENCED: "議事録・候補がある会議の文字起こしは変更できません。" };
type Kind = "meeting" | "participant" | "transcript";
function Mutation({ url, method, label, children, payload, kind, redirect, confirm }: { url: string; method: string; label: string; children?: ReactNode; payload?: object; kind?: Kind; redirect?: string; confirm?: string }) {
 const router = useRouter(); const busy = useRef(false); const [pending, setPending] = useState(false); const [error, setError] = useState("");
 return <form aria-label={label} onSubmit={async (event) => {
  event.preventDefault(); if (busy.current || (confirm && !window.confirm(confirm))) return;
  const form = event.currentTarget; const f = new FormData(form); let data = payload;
  if (kind === "meeting") data = { title: f.get("title"), meetingDate: `${f.get("meetingDate")}${String(f.get("meetingDate")).length === 16 ? ":00" : ""}+09:00` };
  if (kind === "participant") data = { ...(method === "POST" ? { userId: f.get("userId") || null } : {}), ...(f.get("displayName") ? { displayName: f.get("displayName") } : {}), role: f.get("role") };
  if (kind === "transcript") data = { speakerUserId: f.get("speakerUserId") || null, speakerName: f.get("speakerName"), startedAt: Number(f.get("startedAt")), endedAt: f.get("endedAt") === "" ? null : Number(f.get("endedAt")), sequenceNo: Number(f.get("sequenceNo")), text: f.get("text") };
  busy.current = true; setPending(true); setError("");
  try {
   const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: data ? JSON.stringify(data) : undefined });
   if (!response.ok) { const result = await response.json(); setError(apiErrorMessage(response, result, messages[result.error?.code] ?? "処理に失敗しました。再試行してください。")); return; }
   if (redirect) router.push(redirect);
   else if (kind === "meeting" && method === "POST") router.push(`/meetings/${(await response.json()).data.id}`);
   else if (method === "POST") form.reset();
   router.refresh(); setError("保存しました。");
  } catch { setError("通信に失敗しました。再試行してください。"); }
  finally { busy.current = false; setPending(false); }
 }}><fieldset disabled={pending}>{children}<button type="submit">{pending ? "処理中…" : label}</button></fieldset><p role="status">{error}</p></form>;
}
export function MeetingForm({ projectId, meeting }: { projectId: string; meeting?: { id: string; title: string; meetingDate: string } }) {
 const local = meeting ? new Date(new Date(meeting.meetingDate).getTime() + 9 * 3600000).toISOString().slice(0, -1) : "";
 return <Mutation kind="meeting" url={meeting ? `/api/meetings/${meeting.id}` : `/api/projects/${projectId}/meetings`} method={meeting ? "PATCH" : "POST"} label={meeting ? "会議を保存" : "会議を作成"}><label>会議名<input name="title" required maxLength={200} defaultValue={meeting?.title} /></label><label>開催日時（日本時間）<input type="datetime-local" step="0.001" name="meetingDate" required defaultValue={local} /></label></Mutation>;
}
export function MeetingActions({ id, projectId, status }: { id: string; projectId: string; status: MeetingStatus }) {
 const labels: Record<MeetingStatus, string> = { scheduled: "予定", recording: "会議を開始", processing: "処理へ進む", completed: "会議を完了", failed: "失敗として記録" };
 return <section aria-label="会議操作">{transitions[status].map((to) => <Mutation key={to} url={`/api/meetings/${id}`} method="PATCH" payload={{ status: to }} label={labels[to]} />)}{status !== "processing" && status !== "completed" && <Mutation url={`/api/meetings/${id}`} method="DELETE" label="会議を削除" confirm="空の会議を削除しますか？関連データがある会議は削除できません。" redirect={`/projects/${projectId}/meetings`} />}</section>;
}
export type MeetingMember = { userId: string; name: string };
export function ParticipantForm({ meetingId, members, participant }: { meetingId: string; members: MeetingMember[]; participant?: { id: string; displayName: string; role: string } }) {
 return <Mutation kind="participant" url={`/api/meetings/${meetingId}/participants${participant ? `/${participant.id}` : ""}`} method={participant ? "PATCH" : "POST"} label={participant ? "参加者を保存" : "参加者を追加"}>
 {!participant && <label>内部ユーザー<select name="userId" aria-label="内部ユーザー"><option value="">外部参加者</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select></label>}
 <label>表示名<input name="displayName" maxLength={100} defaultValue={participant?.displayName} /></label><p>外部参加者は表示名が必要です。</p>
 <label>参加者ロール<select name="role" aria-label="参加者ロール" defaultValue={participant?.role ?? "participant"}><option value="participant">participant</option><option value="host">host</option></select></label></Mutation>;
}
export function RemoveParticipant({ meetingId, id }: { meetingId: string; id: string }) { return <Mutation url={`/api/meetings/${meetingId}/participants/${id}`} method="DELETE" label="参加者を削除" confirm="この参加者を削除しますか？" />; }
export function Attendance({ meetingId }: { meetingId: string }) { return <div><Mutation url={`/api/meetings/${meetingId}/participants/me/join`} method="POST" label="自分の参加を記録" /><Mutation url={`/api/meetings/${meetingId}/participants/me/leave`} method="POST" label="自分の退出を記録" /></div>; }
export type TranscriptRow = { id: string; speakerUserId: string | null; speakerName: string; startedAt: number; endedAt: number | null; text: string; sequenceNo: number };
export function TranscriptForm({ meetingId, members, nextSequence, transcript }: { meetingId: string; members: MeetingMember[]; nextSequence: number; transcript?: TranscriptRow }) {
 return <Mutation kind="transcript" url={`/api/meetings/${meetingId}/transcripts${transcript ? `/${transcript.id}` : ""}`} method={transcript ? "PATCH" : "POST"} label={transcript ? "文字起こしを保存" : "文字起こしを追加"}>
 <label>話者ユーザー<select name="speakerUserId" aria-label="話者ユーザー" defaultValue={transcript?.speakerUserId ?? ""}><option value="">外部・未設定</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select></label>
 <label>話者名<input name="speakerName" required maxLength={100} defaultValue={transcript?.speakerName} /></label>
 <label>開始秒<input type="number" name="startedAt" required min={0} max={999999999.999} step="0.001" defaultValue={transcript?.startedAt ?? 0} /></label><label>終了秒<input type="number" name="endedAt" min={0} max={999999999.999} step="0.001" defaultValue={transcript?.endedAt ?? ""} /></label>
 <label>発言順<input type="number" name="sequenceNo" required min={1} max={2147483647} defaultValue={transcript?.sequenceNo ?? nextSequence} /></label><label>発言本文<textarea aria-label="発言本文" name="text" required maxLength={10000} defaultValue={transcript?.text} /></label></Mutation>;
}
export function RemoveTranscript({ meetingId, id }: { meetingId: string; id: string }) { return <Mutation url={`/api/meetings/${meetingId}/transcripts/${id}`} method="DELETE" label="文字起こしを削除" confirm="この文字起こしを削除しますか？" />; }
