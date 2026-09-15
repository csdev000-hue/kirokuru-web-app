import Link from "next/link";
import { requirePageUser } from "@/lib/auth/page";
export default async function Page() {
  await requirePageUser();
  return <main><h1>チケット</h1><p><Link href="/projects">プロジェクトを選択</Link>してチケットを管理してください。</p></main>;
}
