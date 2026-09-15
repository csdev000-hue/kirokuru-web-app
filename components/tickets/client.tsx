"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { statuses, priorities, types } from "@/lib/validators/ticket";
import { isOverdue } from "@/lib/utils/ticket-date";
export type Card = { id: string; title: string; description: string | null; status: typeof statuses[number]; priority: string; type: string; assignee: { id: string; name: string } | null; dueDate: string | null };
type Member = { userId: string; name: string };
async function write(url: string, method: string, body?: object) {
 const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
 if (!response.ok) {
  const messages: Record<number, string> = { 400: "入力内容を確認してください。", 401: "再度ログインしてください。", 403: "この操作は許可されていません。", 404: "対象が見つかりません。", 409: "アーカイブ済みプロジェクトは変更できません。", 422: "担当者または入力内容を確認してください。" };
  throw new Error(messages[response.status] ?? "処理に失敗しました。再試行してください。");
 }
 return response.status === 204 ? null : response.json();
}
export function TicketEditor({ projectId, members, existing }: { projectId: string; members: Member[]; existing?: Card }) {
 const router = useRouter(); const lock = useRef(false); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
 async function submit(method: string, body?: object) {
  if (lock.current) return; lock.current = true; setPending(true); setMessage("");
  try { const result = await write(existing ? `/api/tickets/${existing.id}` : `/api/projects/${projectId}/tickets`, method, body); router.push(method === "DELETE" ? `/projects/${projectId}/tickets` : `/tickets/${result.data.id}`); router.refresh(); setMessage("保存しました。"); }
  catch (error) { setMessage(error instanceof Error ? error.message : "通信に失敗しました。"); } finally { lock.current = false; setPending(false); }
 }
 return <section><form onSubmit={(event) => { event.preventDefault(); const f = new FormData(event.currentTarget); void submit(existing ? "PATCH" : "POST", { title: f.get("title"), description: f.get("description"), type: f.get("type"), priority: f.get("priority"), assigneeId: f.get("assigneeId") || null, dueDate: f.get("dueDate") || null, ...(existing ? { status: f.get("status") } : {}) }); }}><fieldset disabled={pending}>
 <label>タイトル<input name="title" required maxLength={300} defaultValue={existing?.title} /></label>
 <label>説明<textarea name="description" maxLength={10000} defaultValue={existing?.description ?? ""} /></label>
 <label>種類<select aria-label="種類" name="type" defaultValue={existing?.type ?? "task"}>{types.map((v) => <option key={v}>{v}</option>)}</select></label>
 <label>優先度<select aria-label="優先度" name="priority" defaultValue={existing?.priority ?? "medium"}>{priorities.map((v) => <option key={v}>{v}</option>)}</select></label>
 {existing && <label>状態<select aria-label="状態" name="status" defaultValue={existing.status}>{statuses.map((v) => <option key={v}>{v}</option>)}</select></label>}
 <label>担当者<select aria-label="担当者" name="assigneeId" defaultValue={existing?.assignee?.id ?? ""}><option value="">未設定</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select></label>
 <label>期限<input type="date" name="dueDate" defaultValue={existing?.dueDate ?? ""} /></label>
 <button type="submit">{pending ? "保存中…" : existing ? "保存" : "チケットを作成"}</button></fieldset></form>
 {existing && <button className="danger" disabled={pending} onClick={() => { if (window.confirm("このチケットを削除しますか？")) void submit("DELETE"); }}>{pending ? "処理中…" : "チケットを削除"}</button>}
 <p role="status">{message}</p></section>;
}
export function CommentForm({ ticketId }: { ticketId: string }) {
 const router = useRouter(); const lock = useRef(false); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
 return <form onSubmit={async (event) => { event.preventDefault(); if (lock.current) return; const form = event.currentTarget; const content = new FormData(form).get("content"); lock.current = true; setPending(true); setMessage(""); try { await write(`/api/tickets/${ticketId}/comments`, "POST", { content }); form.reset(); router.refresh(); setMessage("投稿しました。"); } catch (error) { setMessage(error instanceof Error ? error.message : "通信に失敗しました。"); } finally { lock.current = false; setPending(false); } }}><label>コメント<textarea name="content" required maxLength={5000} disabled={pending} /></label><button disabled={pending}>{pending ? "投稿中…" : "コメントを投稿"}</button><p role="status">{message}</p></form>;
}
export function Board({ tickets, editable, today }: { tickets: Card[]; editable: boolean; today: string }) {
 const router = useRouter(); const [overrides, setOverrides] = useState<Record<string, Card["status"]>>({}); const [pending, setPending] = useState<string | null>(null); const lock = useRef(false); const [error, setError] = useState("");
 async function move(ticket: Card, status: Card["status"]) {
  if (lock.current) return; lock.current = true; setPending(ticket.id); setError(""); setOverrides((v) => ({ ...v, [ticket.id]: status }));
  try { const result = await write(`/api/tickets/${ticket.id}`, "PATCH", { status }); setOverrides((v) => ({ ...v, [ticket.id]: result.data.status })); router.refresh(); }
  catch { setOverrides((v) => ({ ...v, [ticket.id]: ticket.status })); setError("状態を変更できませんでした。元の状態に戻しました。"); }
  finally { setPending(null); lock.current = false; }
 }
 const rows = tickets.map((t) => ({ ...t, status: overrides[t.id] ?? t.status }));
 return <><p role="alert">{error}</p><p role="status">{pending ? "状態を更新中…" : ""}</p><div className="kanban">{statuses.map((status) => <section aria-label={status} key={status}><h2>{status.toUpperCase().replaceAll("_", " ")}</h2>{!rows.some((t) => t.status === status) && <p>このステータスのチケットはありません</p>}{rows.filter((t) => t.status === status).map((ticket) => <article key={ticket.id}><Link href={`/tickets/${ticket.id}`}>{ticket.title}</Link><p>{ticket.priority} · {ticket.type}</p><p>{ticket.assignee?.name ?? "未設定"} · {ticket.dueDate ?? "期限なし"} {isOverdue(ticket.dueDate, ticket.status, today) && <strong>期限切れ</strong>}</p>{editable && <label>状態変更: {ticket.title}<select aria-label={`状態変更: ${ticket.title}`} value={ticket.status} disabled={pending !== null} onChange={(event) => void move(ticket, event.target.value as Card["status"])}>{statuses.map((v) => <option key={v}>{v}</option>)}</select></label>}</article>)}</section>)}</div></>;
}
