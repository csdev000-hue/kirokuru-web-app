import Link from "next/link";
import { requirePageUser } from "@/lib/auth/page";
import { getProject, listProjectMembers } from "@/lib/services/project-service";
import { listTickets } from "@/lib/services/ticket-service";
import { pageResource } from "@/lib/services/page-resource";
import { ticketListQuerySchema, statuses, priorities, types } from "@/lib/validators/ticket";
import { isOverdue, todayInJapan } from "@/lib/utils/ticket-date";
import { Board } from "./client";
export async function TicketListPage({ id, searchParams, board = false }: { id: string; searchParams: Record<string, string | string[] | undefined>; board?: boolean }) {
 const user = await requirePageUser(); const project = await pageResource(() => getProject(user.id, id));
 const input = Object.fromEntries(Object.entries(searchParams).filter(([, v]) => v !== "" && v !== undefined)); const parsed = ticketListQuerySchema.safeParse(input);
 if (!parsed.success) return <main><h1>入力内容を確認してください</h1><Link href={`/projects/${id}/tickets`}>絞り込みを解除</Link></main>;
 const f = parsed.data; const [result, members] = await Promise.all([listTickets(user.id, id, f), listProjectMembers(user.id, id)]); const editable = project.role !== "viewer" && project.status === "active"; const today = todayInJapan();
 const url = (page: number) => { const params = new URLSearchParams(Object.entries(f).map(([k, v]) => [k, String(v)])); params.set("page", String(page)); return `?${params}`; };
 return <main><Link href={`/projects/${id}`}>{project.name}</Link><h1>{board ? "カンバン" : "チケット一覧"}</h1><nav><Link href={`/projects/${id}/tickets`}>一覧</Link><Link href={`/projects/${id}/board`}>カンバン</Link>{editable && <Link href={`/projects/${id}/tickets/new`}>チケットを作成</Link>}</nav>
 <form className="ticket-filters"><label>検索<input name="q" defaultValue={f.q} maxLength={300} /></label>{([["status", "状態", statuses], ["priority", "優先度", priorities], ["type", "種類", types]] as const).map(([key, label, values]) => <label key={key}>{label}<select aria-label={label} name={key} defaultValue={f[key] ?? ""}><option value="">すべて</option>{values.map((v) => <option key={v}>{v}</option>)}</select></label>)}
 <label>担当者<select aria-label="担当者" name="assigneeId" defaultValue={f.assigneeId ?? ""}><option value="">全員</option>{members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select></label>
 <label>期限開始<input type="date" name="dueFrom" defaultValue={f.dueFrom} /></label><label>期限終了<input type="date" name="dueTo" defaultValue={f.dueTo} /></label>
 <label>並び順<select aria-label="並び順" name="sort" defaultValue={f.sort}>{["updatedAt", "createdAt", "dueDate", "priority"].map((v) => <option key={v}>{v}</option>)}</select></label><label>方向<select aria-label="方向" name="order" defaultValue={f.order}><option value="desc">降順</option><option value="asc">昇順</option></select></label><button>絞り込む</button><Link href={`/projects/${id}/${board ? "board" : "tickets"}`}>解除</Link></form>
 <p>{result.meta.total}件・{f.page}ページ（1ページ最大{f.limit}件）</p>
 {board ? <Board key={JSON.stringify(result.data)} tickets={result.data} editable={editable} today={today} /> : result.data.length ? <ul className="resource-list">{result.data.map((ticket) => <li key={ticket.id}><Link href={`/tickets/${ticket.id}`}>{ticket.title}</Link><span>{ticket.status} · {ticket.priority} · {ticket.type} · {ticket.assignee?.name ?? "未設定"} · {ticket.dueDate ?? "期限なし"} {isOverdue(ticket.dueDate, ticket.status, today) && <strong>期限切れ</strong>} · 更新 {ticket.updatedAt.toISOString().slice(0, 10)}</span></li>)}</ul> : <p>まだチケットがありません。条件を解除するか、最初のチケットを作成してください。</p>}
 <nav aria-label="ページ">{f.page > 1 && <Link href={url(f.page - 1)}>前のページ</Link>}{f.page < result.meta.totalPages && <Link href={url(f.page + 1)}>次のページ</Link>}</nav></main>;
}
