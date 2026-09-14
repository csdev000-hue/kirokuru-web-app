import { requirePageUser } from "@/lib/auth/page";
import { Editor } from "@/components/management/editor";
export default async function Page() { await requirePageUser(); return <main><h1>組織を作成</h1><Editor kind="organizations" /></main>; }
