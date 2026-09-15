import Link from "next/link";
import { requirePageUser } from "@/lib/auth/page";
export default async function Page() { await requirePageUser(); return <main><h1>会議</h1><Link href="/projects">プロジェクトを選択</Link>して会議を管理してください。</main>; }
