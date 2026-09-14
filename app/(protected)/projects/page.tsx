import Link from "next/link";
import { requirePageUser } from "@/lib/auth/page";
import { listProjects } from "@/lib/services/project-service";
import { Projects } from "@/components/management/lists";
export default async function ProjectsPage() {
 const user = await requirePageUser(); const rows = await listProjects(user.id);
 return <main><h1>プロジェクト一覧</h1><Link href="/projects/new">プロジェクトを作成</Link><Projects projects={rows} /></main>;
}
