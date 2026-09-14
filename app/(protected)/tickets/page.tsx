import { requirePageUser } from "@/lib/auth/page";
export default async function Page() {
  await requirePageUser();
  return <main><h1>チケット</h1><p>準備中です。</p></main>;
}
