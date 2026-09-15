import { requirePageUser } from "@/lib/auth/page";
import { getProject, listProjectMembers } from "@/lib/services/project-service";
import { pageResource } from "@/lib/services/page-resource";
import { TicketEditor } from "@/components/tickets/client";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
 const user = await requirePageUser(); const { id } = await params; const project = await pageResource(() => getProject(user.id, id));
 if (project.role === "viewer" || project.status === "archived") return <main><h1>チケットを作成できません</h1><p>閲覧専用のプロジェクトです。</p></main>;
 const members = await listProjectMembers(user.id, id); return <main><h1>チケットを作成</h1><TicketEditor projectId={id} members={members} /></main>;
}
