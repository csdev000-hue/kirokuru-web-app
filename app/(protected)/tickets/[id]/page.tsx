import Link from "next/link";
import { requirePageUser } from "@/lib/auth/page";
import { getTicket } from "@/lib/services/ticket-service";
import { listTicketComments } from "@/lib/services/ticket-comment-service";
import { getProject, listProjectMembers } from "@/lib/services/project-service";
import { pageResource } from "@/lib/services/page-resource";
import { TicketEditor, CommentForm } from "@/components/tickets/client";
import { isOverdue } from "@/lib/utils/ticket-date";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
 const user = await requirePageUser(); const { id } = await params; const ticket = await pageResource(() => getTicket(user.id, id));
 const [project, members, comments] = await Promise.all([getProject(user.id, ticket.projectId), listProjectMembers(user.id, ticket.projectId), listTicketComments(user.id, id)]);
 const editable = project.role !== "viewer" && project.status === "active";
 return <main><Link href={`/projects/${ticket.projectId}/tickets`}>チケット一覧へ</Link><h1>{ticket.title}</h1><p className="user-content">{ticket.description}</p><p>{ticket.status} · {ticket.priority} · {ticket.type}</p><p>担当者: {ticket.assignee?.name ?? "未設定"} · 期限: {ticket.dueDate ?? "なし"} {isOverdue(ticket.dueDate, ticket.status) && <strong>期限切れ</strong>}</p><p>作成者: {ticket.createdBy.name} · 作成: {ticket.createdAt.toISOString()} · 更新: {ticket.updatedAt.toISOString()}</p>{(ticket.sourceMeetingId || ticket.sourceCandidateId) && <section aria-label="作成元"><p>会議から生成されたチケット</p></section>}
 {editable && <TicketEditor key={ticket.updatedAt.toISOString()} projectId={ticket.projectId} members={members} existing={ticket} />}
 <section><h2>コメント</h2>{comments.length ? <ul>{comments.map((c) => <li key={c.id}><p>{c.author.name} · {c.createdAt.toISOString()}</p><p className="user-content">{c.content}</p></li>)}</ul> : <p>まだコメントがありません</p>}{editable && <CommentForm ticketId={id} />}</section></main>;
}
