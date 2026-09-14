import Link from "next/link";
import { requirePageUser } from "@/lib/auth/page";
import { logout } from "@/lib/auth/actions";
export const dynamic = "force-dynamic";
export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser();
  return <>
    <nav aria-label="アカウント"><Link href="/dashboard">ダッシュボード</Link><Link href="/organizations">組織</Link><Link href="/projects">プロジェクト</Link><form action={logout}><button type="submit">ログアウト</button></form></nav>
    {children}
  </>;
}
