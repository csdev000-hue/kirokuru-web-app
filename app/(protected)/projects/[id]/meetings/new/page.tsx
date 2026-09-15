import { requirePageUser } from "@/lib/auth/page";
import { getProject } from "@/lib/services/project-service";
import { pageResource } from "@/lib/services/page-resource";
import { MeetingForm } from "@/components/meetings/forms";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
 const user = await requirePageUser(); const { id } = await params; const project = await pageResource(() => getProject(user.id, id));
 if (project.role === "viewer" || project.status !== "active") return <main><h1>会議を作成できません</h1><p>閲覧専用のプロジェクトです。</p></main>;
 return <main><h1>会議を作成</h1><MeetingForm projectId={id} /></main>;
}
