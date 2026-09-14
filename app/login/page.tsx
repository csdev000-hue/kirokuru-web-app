import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAuthSettings } from "@/lib/auth/settings";
import { login } from "@/lib/auth/actions";
export const dynamic = "force-dynamic";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  let user = null;
  let unavailable = !getAuthSettings();
  try { user = await getCurrentUser(); } catch { unavailable = true; }
  if (user) redirect("/dashboard");
  const { error } = await searchParams;
  return <main>
    <h1>AIプロジェクトマネージャー</h1>
    <h2>ログイン</h2>
    {unavailable ? <p role="alert">現在ログインを利用できません。管理者にお問い合わせください。</p> : error ? <p role="alert">ログインできませんでした。もう一度お試しください。</p> : null}
    <form action={login}><button type="submit" disabled={unavailable}>Googleでログイン</button></form>
  </main>;
}
