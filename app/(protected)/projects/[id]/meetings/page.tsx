import Link from "next/link";
import { requirePageUser } from "@/lib/auth/page";
import { getProject } from "@/lib/services/project-service";
import { listMeetings } from "@/lib/services/meeting-service";
import { pageResource } from "@/lib/services/page-resource";
import { meetingListQuerySchema, meetingStatuses } from "@/lib/validators/meeting";
import { meetingTime } from "@/lib/utils/meeting-time";
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
 const user = await requirePageUser(); const { id } = await params; const project = await pageResource(() => getProject(user.id, id));
 const parsed = meetingListQuerySchema.safeParse(Object.fromEntries(Object.entries(await searchParams).filter(([,v]) => v !== "" && v !== undefined)));
 if (!parsed.success) return <main><h1>絞り込み条件を確認してください</h1><Link href={`/projects/${id}/meetings`}>解除</Link></main>;
 const f = parsed.data; const result = await listMeetings(user.id, id, f);
 const url = (page: number) => { const query = new URLSearchParams(Object.entries(f).map(([k,v]) => [k, String(v)])); query.set("page", String(page)); return `?${query}`; };
 return <main><Link href={`/projects/${id}`}>{project.name}</Link><h1>会議一覧</h1>{project.role !== "viewer" && project.status === "active" && <Link href={`/projects/${id}/meetings/new`}>会議を作成</Link>}
 <form className="ticket-filters"><label>状態<select name="status" aria-label="状態" defaultValue={f.status ?? ""}><option value="">すべて</option>{meetingStatuses.map((s) => <option key={s}>{s}</option>)}</select></label><label>開始日（日本時間）<input type="date" name="from" defaultValue={f.from} /></label><label>終了日（日本時間）<input type="date" name="to" defaultValue={f.to} /></label><label>並び順<select name="sort" aria-label="並び順" defaultValue={f.sort}>{["meetingDate", "createdAt", "updatedAt"].map((v) => <option key={v}>{v}</option>)}</select></label><label>方向<select name="order" aria-label="方向" defaultValue={f.order}><option value="desc">降順</option><option value="asc">昇順</option></select></label><button>絞り込む</button></form>
 <p>{result.meta.total}件・{f.page}ページ</p>{result.data.length ? <ul className="resource-list">{result.data.map((meeting) => <li key={meeting.id}><Link href={`/meetings/${meeting.id}`}>{meeting.title}</Link><span>{meetingTime(meeting.meetingDate)}（日本時間）· {meeting.status} · {meeting.participantCount}名 · {meeting.createdBy.name}</span></li>)}</ul> : <p>まだ会議がありません。条件を解除するか、最初の会議を作成してください。</p>}
 <nav aria-label="ページ">{f.page > 1 && <Link href={url(f.page - 1)}>前のページ</Link>}{f.page < result.meta.totalPages && <Link href={url(f.page + 1)}>次のページ</Link>}</nav></main>;
}
