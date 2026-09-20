"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
const errors: Record<string, string> = { TICKET_PRIORITY_REQUIRED: "優先度が未設定です。優先度を設定して承認した候補を登録してください。", INVALID_ASSIGNEE: "担当者のProject所属を確認してください。", TICKET_CANDIDATE_ALREADY_REGISTERED: "登録済み候補が含まれています。再読み込みしてください。", TICKET_CANDIDATE_NOT_APPROVED: "承認済み候補のみ登録できます。", FORBIDDEN: "登録する権限がありません。", PROJECT_ARCHIVED: "アーカイブ済みProjectには登録できません。" };
async function requestRegistration(url: string, body: object) {
 const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const json = await response.json();
 if (!response.ok) throw new Error(errors[json.error?.code] ?? "チケット登録に失敗しました。再試行してください。"); return json.data;
}
export function RegisterCandidate({ id }: { id: string }) {
 const router = useRouter(); const busy = useRef(false); const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [ticket, setTicket] = useState<{ ticketId: string; deleted: boolean } | null>(null);
 return <section>{ticket ? <p>{ticket.deleted ? "登録先のTicketは削除済みです。再登録はできません。" : <a href={`/tickets/${ticket.ticketId}`}>正式チケットを見る</a>}</p> : <button disabled={pending} onClick={async () => { if (busy.current) return; busy.current = true; setPending(true); setError(""); try { const result = await requestRegistration(`/api/ticket-candidates/${id}/register`, {}); setTicket(result); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : "チケット登録に失敗しました。"); } finally { busy.current = false; setPending(false); } }}>{pending ? "登録中…" : "正式チケットとして登録"}</button>}<p role="status">{error}</p></section>;
}
export function BulkRegisterCandidates({ candidates }: { candidates: { id: string; title: string; priority: string | null }[] }) {
 const router = useRouter(); const [selected, setSelected] = useState<string[]>([]); const [pending, setPending] = useState(false); const [message, setMessage] = useState(""); const busy = useRef(false);
 if (!candidates.length) return null;
 return <section aria-label="候補の一括登録"><h2>承認済み候補を一括登録</h2><p>最大50件。1件でも登録できない候補があれば、全件登録されません。</p><fieldset disabled={pending}>{candidates.map((c) => <label key={c.id}><input type="checkbox" disabled={!c.priority || (selected.length >= 50 && !selected.includes(c.id))} checked={selected.includes(c.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, c.id] : selected.filter((id) => id !== c.id))} />{c.title}{!c.priority && "（優先度未設定）"}</label>)}<button disabled={!selected.length || pending} onClick={async () => { if (busy.current) return; busy.current = true; setPending(true); setMessage(""); try { const result = await requestRegistration("/api/ticket-candidates/bulk-register", { candidateIds: selected }); setSelected([]); setMessage(`${result.registered.length}件を登録しました。`); router.refresh(); } catch (e) { setMessage(e instanceof Error ? e.message : "チケット登録に失敗しました。"); } finally { busy.current = false; setPending(false); } }}>{pending ? "登録中…" : "選択した候補を正式登録"}</button></fieldset><p role="status">{message}</p></section>;
}
