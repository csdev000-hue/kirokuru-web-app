import Link from "next/link";
import { requirePageUser } from "@/lib/auth/page";
import { listOrganizations } from "@/lib/services/organization-service";
import { Editor } from "@/components/management/editor";
export default async function Page({ searchParams }: { searchParams: Promise<{ organizationId?: string }> }) {
 const user = await requirePageUser(); const organizations = await listOrganizations(user.id); const { organizationId } = await searchParams;
 return <main><h1>プロジェクトを作成</h1>{organizations.length ? <Editor kind="projects" organizations={organizations.map(({id, name}) => ({ id, name }))} organizationId={organizations.some((org) => org.id === organizationId) ? organizationId : undefined} /> : <p>先に<Link href="/organizations/new">組織を作成</Link>してください。</p>}</main>;
}
