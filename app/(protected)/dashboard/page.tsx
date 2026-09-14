import { requirePageUser } from "@/lib/auth/page";
export default async function DashboardPage() {
  const user = await requirePageUser();
  return <main><h1>AIプロジェクトマネージャー</h1><h2>ダッシュボード</h2><p>ログインユーザー:</p><p>{user.name}</p><p>{user.email}</p></main>;
}
