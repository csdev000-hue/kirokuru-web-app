"use client";
import { apiErrorMessage } from "@/lib/api/client-error";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MinutesItem, ActionItem } from "@/lib/ai/schemas/minutes";
import { transcriptTimestamp } from "@/lib/utils/meeting-time";
type Content = { summary: string; decisions: MinutesItem[]; actionItems: ActionItem[]; issues: MinutesItem[]; pendingItems: MinutesItem[] };
type Evidence = { id: string; sequenceNo: number; speakerName: string; startedAt: number; endedAt: number | null; text: string };
const messages: Record<string, string> = { MINUTES_GENERATION_CONFLICT: "議事録を生成中です。しばらく待って再試行してください。", AI_CONTEXT_TOO_LARGE: "文字起こしが生成可能な入力上限を超えています。", AI_TIMEOUT: "生成がタイムアウトしました。再試行してください。", AI_RATE_LIMITED: "生成が混み合っています。時間をおいて再試行してください。", FORBIDDEN: "この操作は許可されていません。", MINUTES_APPROVED: "承認済み議事録は編集できません。", VALIDATION_ERROR: "入力内容と根拠を確認してください。", AI_EVIDENCE_INVALID: "根拠や担当者を確認してください。" };
async function mutate(url: string, method: string, body: object, key?: string) {
 const response = await fetch(url, { method, headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(body) });
 const result = await response.json();
 if (!response.ok) throw new Error(apiErrorMessage(response, result, messages[result.error?.code] ?? "処理に失敗しました。再試行してください。"));
 return result.data;
}
export function GenerateMinutes({ meetingId, regenerate }: { meetingId: string; regenerate: boolean }) {
 const router = useRouter(); const busy = useRef(false); const key = useRef<string | null>(null); const [pending, setPending] = useState(false); const [error, setError] = useState("");
 return <section><button disabled={pending} onClick={async () => {
  if (busy.current) return; busy.current = true; setPending(true); setError(""); key.current ??= crypto.randomUUID();
  try { const data = await mutate("/api/ai/generate-minutes", "POST", { meetingId, regenerate }, key.current); key.current = null; router.push(`/meetings/${meetingId}/minutes?version=${data.version}`); router.refresh(); }
  catch (e) { setError(e instanceof Error ? e.message : "生成に失敗しました。"); }
  finally { busy.current = false; setPending(false); }
 }}>{pending ? "生成中…" : regenerate ? "新しいVersionを再生成" : "AI議事録を生成"}</button><p role="status">{error}</p></section>;
}
export function MinutesReview({ meetingId, minutes, evidence, members, canWrite }: { meetingId: string; minutes: Content & { id: string; version: number; status: string }; evidence: Evidence[]; members: { userId: string; name: string }[]; canWrite: boolean }) {
 const router = useRouter(); const [content, setContent] = useState<Content>({ summary: minutes.summary, decisions: minutes.decisions, actionItems: minutes.actionItems, issues: minutes.issues, pendingItems: minutes.pendingItems });
 const [dirty, setDirty] = useState(false); const [pending, setPending] = useState(false); const [message, setMessage] = useState(""); const busy = useRef(false);
 const editable = canWrite && minutes.status !== "approved";
 function change(next: Content) { setContent(next); setDirty(true); }
 async function save(approve: boolean) {
  if (busy.current || (approve && dirty)) return; busy.current = true; setPending(true); setMessage("");
  try { await mutate(`/api/minutes/${minutes.id}${approve ? "/approve" : ""}`, approve ? "POST" : "PATCH", approve ? {} : content); setDirty(false); setMessage(approve ? "承認しました。" : "保存しました。"); router.refresh(); }
  catch (e) { setMessage(e instanceof Error ? e.message : "保存に失敗しました。"); }
  finally { busy.current = false; setPending(false); }
 }
 return <article><h2>Version {minutes.version} · {minutes.status}</h2>{!editable && <p>この議事録は閲覧専用です。</p>}
 <fieldset disabled={!editable || pending}><label>要約<textarea aria-label="要約" maxLength={5000} value={content.summary} onChange={(e) => change({ ...content, summary: e.target.value })} /></label></fieldset>
 {([['decisions', '決定事項'], ['actionItems', 'アクション項目'], ['issues', '課題'], ['pendingItems', '保留事項']] as const).map(([key, label]) => <section key={key}><h3>{label}</h3>{content[key].length === 0 && <p>項目はありません。</p>}{content[key].map((item, index) => {
  const action = key === "actionItems" ? content.actionItems[index] : undefined;
  const update = (patch: Partial<MinutesItem & ActionItem>) => change({ ...content, [key]: content[key].map((row, i) => i === index ? { ...row, ...patch } : row) });
  return <div key={index}><fieldset disabled={!editable || pending}><legend>{label} {index + 1}</legend><label>タイトル<input maxLength={300} value={item.title} onChange={(e) => update({ title: e.target.value })} /></label><label>詳細<textarea maxLength={3000} value={item.detail} onChange={(e) => update({ detail: e.target.value })} /></label>
  {action && <><label>担当者<select value={action.assignee?.user_id ?? ""} onChange={(e) => { const member = members.find((m) => m.userId === e.target.value); update({ assignee: member ? { user_id: member.userId, display_name: member.name } : null }); }}><option value="">未設定{action.assignee && !action.assignee.user_id ? `（${action.assignee.display_name}）` : ""}</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select></label><label>期限<input type="date" value={action.due_date ?? ""} onChange={(e) => update({ due_date: e.target.value || null })} /></label></>}
  {editable && <><label>根拠となる発言（1〜10件）<select multiple value={item.source_evidence.map((s) => s.transcript_id)} onChange={(e) => update({ source_evidence: Array.from(e.target.selectedOptions).map((o) => { const t = evidence.find((t) => t.id === o.value)!; return { transcript_id: t.id, started_at: t.startedAt, ended_at: t.endedAt }; }) })}>{evidence.map((t) => <option key={t.id} value={t.id}>{t.sequenceNo} · {t.speakerName}: {t.text.slice(0, 80)}</option>)}</select></label><button onClick={() => change({ ...content, [key]: content[key].filter((_, i) => i !== index) })}>項目を削除</button></>}
  </fieldset><ul>{item.source_evidence.map((source) => { const t = evidence.find((t) => t.id === source.transcript_id); return <li key={source.transcript_id}>{t ? <a href={`/meetings/${meetingId}?fromSequence=${t.sequenceNo}#transcript-${t.id}`}>{transcriptTimestamp(t.startedAt)} {t.speakerName} · 根拠を確認</a> : "根拠を確認できません"}</li>; })}</ul></div>;
 })}{editable && <button disabled={pending || content[key].length >= 100} onClick={() => change({ ...content, [key]: [...content[key], { title: "", detail: "", source_evidence: [], ...(key === "actionItems" ? { assignee: null, due_date: null } : {}) }] })}>{label}を追加</button>}</section>)}
 {editable && <><button disabled={pending || !dirty} onClick={() => save(false)}>議事録を保存</button><button disabled={pending || dirty} onClick={() => save(true)}>内容を確認して承認</button>{dirty && <p>変更を保存してから承認してください。</p>}</>}<p role="status">{message}</p></article>;
}
