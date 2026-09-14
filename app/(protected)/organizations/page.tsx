import Link from "next/link";
import { requirePageUser } from "@/lib/auth/page";
import { listOrganizations } from "@/lib/services/organization-service";
export default async function OrganizationsPage() {
 const user = await requirePageUser(); const rows = await listOrganizations(user.id);
 return <main><h1>組織一覧</h1><Link href="/organizations/new">組織を作成</Link>{rows.length ? <ul className="resource-list">{rows.map((row) => <li key={row.id}><Link href={`/organizations/${row.id}`}>{row.name}</Link><span>{row.role}</span></li>)}</ul> : <p>まだOrganizationがありません</p>}</main>;
}
