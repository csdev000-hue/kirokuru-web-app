"use client";
import { apiErrorMessage } from "@/lib/api/client-error";
import { useRef, useState } from "react";
import { RegisterCandidate } from "./registration";
import { useRouter } from "next/navigation";
import type { getTicketCandidate } from "@/lib/services/ticket-candidate-service";
import { transcriptTimestamp } from "@/lib/utils/meeting-time";
export type CandidateView = Omit<Awaited<ReturnType<typeof getTicketCandidate>>, "createdAt" | "updatedAt">;
const messages: Record<string, string> = { MINUTES_NOT_APPROVED: "承認済み議事録を選択してください。", AI_TICKET_GENERATION_CONFLICT: "候補を生成中です。しばらく待って再試行してください。", AI_CONTEXT_TOO_LARGE: "入力が生成可能な上限を超えています。", INVALID_ASSIGNEE: "担当者はProject Memberから選択してください。", FORBIDDEN: "この操作は許可されていません。", VALIDATION_ERROR: "入力内容を確認してください。", TICKET_CANDIDATE_ALREADY_APPROVED: "すでに承認済みです。画面を再読み込みしてください。", TICKET_CANDIDATE_ALREADY_REJECTED: "すでに却下済みです。画面を再読み込みしてください。" };
async function mutate(url: string, method: string, body: object, key?: string) {
 const response = await fetch(url, { method, headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(body) });
 const json = await response.json(); if (!response.ok) throw new Error(apiErrorMessage(response, json, messages[json.error?.code] ?? "処理に失敗しました。再試行してください。")); return json.data;
}
export function GenerateCandidates({ meetingId, minutesId, regenerate }: { meetingId: string; minutesId: string; regenerate: boolean }) {
 const router = useRouter(); const busy = useRef(false); const key = useRef<string | null>(null); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
 return <section><button disabled={pending} onClick={async () => {
  if (busy.current) return; busy.current = true; setPending(true); setMessage(""); key.current ??= crypto.randomUUID();
  try { const result = await mutate("/api/ai/generate-tickets", "POST", { meetingId, minutesId, regenerate }, key.current); key.current = null; setMessage(`${result.candidates.length}件の候補を生成しました。`); router.refresh(); }
  catch (e) { setMessage(e instanceof Error ? e.message : "生成に失敗しました。"); } finally { busy.current = false; setPending(false); }
 }}>{pending ? "チケット候補を生成しています…" : regenerate ? "チケット候補を再生成" : "AIチケット候補を生成"}</button><p role="status">{message}</p></section>;
}
export function CandidateReview({ candidate, members, canWrite }: { candidate: CandidateView; members: { userId: string; name: string }[]; canWrite: boolean }) {
 const router = useRouter(); const [content, setContent] = useState({ title: candidate.title, description: candidate.description, type: candidate.type, priority: candidate.priority, assigneeId: candidate.assigneeId, dueDate: candidate.dueDate });
 const [dirty, setDirty] = useState(false); const [pending, setPending] = useState(false); const [message, setMessage] = useState(""); const busy = useRef(false); const editable = canWrite && candidate.status === "pending";
 function change(value: Partial<typeof content>) { setContent({ ...content, ...value }); setDirty(true); }
 async function save(action: "update" | "approve" | "reject") {
  if (busy.current || (action !== "update" && dirty)) return; busy.current = true; setPending(true); setMessage("");
  try { await mutate(`/api/ticket-candidates/${candidate.id}${action === "update" ? "" : `/${action}`}`, action === "update" ? "PATCH" : "POST", action === "update" ? content : {}); setDirty(false); router.refresh(); setMessage(action === "update" ? "保存しました。" : action === "approve" ? "候補を承認しました。" : "候補を却下しました。"); }
  catch (e) { setMessage(e instanceof Error ? e.message : "処理に失敗しました。"); } finally { busy.current = false; setPending(false); }
 }
 const state = { pending: "確認待ち", approved: "承認済み候補", rejected: "却下済み候補", registered: "登録済み候補" }[candidate.status];
 return <article aria-label={candidate.title}><h2><a href={`/ticket-candidates/${candidate.id}`}>{candidate.title}</a></h2><p>状態: {state}</p><p>AI生成時Confidence: {candidate.confidence === null ? "不明" : `${Math.round(candidate.confidence * 100)}%`}（抽出確度の参考値です。正しさを保証するものではありません。）</p><a href={`/meetings/${candidate.meetingId}/minutes?version=${candidate.minutesVersion}`}>元の議事録 Version {candidate.minutesVersion}</a>
 <fieldset disabled={!editable || pending}><legend>候補の内容</legend><label>タイトル<input aria-label="タイトル" maxLength={300} value={content.title} onChange={(e) => change({ title: e.target.value })} /></label><label>説明<textarea aria-label="説明" maxLength={10000} value={content.description ?? ""} onChange={(e) => change({ description: e.target.value || null })} /></label><label>タイプ<select aria-label="タイプ" value={content.type} onChange={(e) => change({ type: e.target.value as typeof content.type })}><option value="task">作業</option><option value="issue">課題</option><option value="followup">フォローアップ</option></select></label><label>優先度<select aria-label="優先度" value={content.priority ?? ""} onChange={(e) => change({ priority: (e.target.value || null) as typeof content.priority })}><option value="">未設定</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option><option value="urgent">緊急</option></select></label><label>担当者<select aria-label="担当者" value={content.assigneeId ?? ""} onChange={(e) => change({ assigneeId: e.target.value || null })}><option value="">未設定</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select></label><label>期限<input aria-label="期限" type="date" value={content.dueDate ?? ""} onChange={(e) => change({ dueDate: e.target.value || null })} /></label></fieldset>
 <section><h3>根拠</h3>{candidate.sourceEvidence.map((e) => <blockquote key={e.transcriptId}><a href={`/meetings/${candidate.meetingId}?fromSequence=${e.sequenceNo}#transcript-${e.transcriptId}`}>{transcriptTimestamp(e.startedAt)} {e.speakerName} · 発言を確認</a><p className="user-content">{e.text}</p></blockquote>)}</section>
 {editable ? <><button disabled={pending || !dirty} onClick={() => save("update")}>候補を保存</button><button disabled={pending || dirty} onClick={() => save("approve")}>承認</button><button disabled={pending || dirty} onClick={() => save("reject")}>却下</button>{dirty && <p>変更を保存してから承認・却下してください。</p>}</> : <p>閲覧専用です。</p>}{candidate.status === "approved" && canWrite && <RegisterCandidate id={candidate.id} />}{candidate.status === "registered" && candidate.registeredTicketId && <p><a href={`/tickets/${candidate.registeredTicketId}`}>正式チケットを見る</a></p>}{editable && !content.priority && <p>正式登録には優先度が必要です。承認前に設定してください。</p>}{candidate.status === "approved" && !candidate.priority && <p>優先度未設定のため登録できません。候補を再生成し、優先度を設定してから承認してください。</p>}<p role="status">{message}</p></article>;
}
