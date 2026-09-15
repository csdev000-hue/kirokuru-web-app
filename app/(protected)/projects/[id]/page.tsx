import Link from "next/link";
import { requirePageUser } from "@/lib/auth/page";
import { getProject, listProjectMembers } from "@/lib/services/project-service";
import { pageResource } from "@/lib/services/page-resource";
import { Editor } from "@/components/management/editor";
import { Members } from "@/components/management/lists";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
 const user = await requirePageUser(); const { id } = await params;
 const project = await pageResource(() => getProject(user.id, id)); const members = await listProjectMembers(user.id, id);
 return <main><Link href={`/organizations/${project.organizationId}`}>組織へ</Link><h1>{project.name}</h1><nav><Link href={`/projects/${project.id}/tickets`}>チケット一覧</Link><Link href={`/projects/${project.id}/board`}>カンバン</Link><Link href={`/projects/${project.id}/meetings`}>会議一覧</Link></nav><p>{project.description || "説明はありません"}</p><p>状態: {project.status} · あなたの権限: {project.role}</p><Members members={members} />{project.role === "owner" && <><h2>プロジェクト設定</h2><Editor key={project.updatedAt.toISOString()} kind="projects" existing={{ id: project.id, name: project.name, description: project.description, status: project.status }} /></>}</main>;
}
