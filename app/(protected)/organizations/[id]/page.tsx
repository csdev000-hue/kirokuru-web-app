import Link from "next/link";
import { requirePageUser } from "@/lib/auth/page";
import { getOrganization, listOrganizationMembers } from "@/lib/services/organization-service";
import { listProjects } from "@/lib/services/project-service";
import { pageResource } from "@/lib/services/page-resource";
import { Editor } from "@/components/management/editor";
import { Members, Projects } from "@/components/management/lists";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
 const user = await requirePageUser(); const { id } = await params;
 const org = await pageResource(() => getOrganization(user.id, id));
 const [members, projects] = await Promise.all([listOrganizationMembers(user.id, id), listProjects(user.id, id)]);
 return <main><Link href="/organizations">組織一覧へ</Link><h1>{org.name}</h1><p>あなたの権限: {org.role}</p><h2>プロジェクト</h2><Link href={`/projects/new?organizationId=${org.id}`}>プロジェクトを作成</Link><Projects projects={projects} /><Members members={members} />{org.role === "owner" && <><h2>組織設定</h2><Editor key={org.updatedAt.toISOString()} kind="organizations" existing={{ id: org.id, name: org.name }} /></>}</main>;
}
