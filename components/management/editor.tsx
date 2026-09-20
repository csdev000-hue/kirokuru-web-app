"use client";
import { apiErrorMessage } from "@/lib/api/client-error";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
type Props = { kind: "organizations" | "projects"; existing?: { id: string; name: string; description?: string | null; status?: string }; organizations?: { id: string; name: string }[]; organizationId?: string };
const messages: Record<string, string> = { FORBIDDEN: "この操作は許可されていません。", UNAUTHENTICATED: "再度ログインしてください。", RESOURCE_NOT_FOUND: "対象が見つかりません。", VALIDATION_ERROR: "入力内容を確認してください。", ORGANIZATION_NOT_EMPTY: "プロジェクトが存在する組織は削除できません。" };
export function Editor({ kind, existing, organizations = [], organizationId }: Props) {
  const router = useRouter(); const busy = useRef(false);
  const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  async function send(method: "POST" | "PATCH" | "DELETE", body?: object) {
    if (busy.current) return;
    busy.current = true; setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/${kind}${existing ? `/${existing.id}` : ""}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      if (!response.ok) { const result = await response.json(); setMessage(apiErrorMessage(response, result, messages[result.error?.code] ?? "処理に失敗しました。時間をおいて再試行してください。")); return; }
      if (method === "DELETE") { router.push(`/${kind}`); router.refresh(); }
      else { const result = await response.json(); router.push(`/${kind}/${result.data.id}`); router.refresh(); setMessage("保存しました。"); }
    } catch { setMessage("通信に失敗しました。再試行してください。"); }
    finally { busy.current = false; setPending(false); }
  }
  return <section aria-label={existing ? "設定" : "新規作成"}>
    <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void send(existing ? "PATCH" : "POST", { name: data.get("name"), ...(kind === "projects" ? { description: data.get("description"), ...(existing ? { status: data.get("status") } : { organizationId: data.get("organizationId") }) } : {}) }); }}>
      <fieldset disabled={pending}>
        {kind === "projects" && !existing && <label>組織<select name="organizationId" required defaultValue={organizationId ?? organizations[0]?.id}>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>}
        <label>{kind === "organizations" ? "組織名" : "プロジェクト名"}<input name="name" required maxLength={200} defaultValue={existing?.name} /></label>
        {kind === "projects" && <label>説明<textarea name="description" maxLength={5000} defaultValue={existing?.description ?? ""} /></label>}
        {kind === "projects" && existing && <label>状態<select name="status" defaultValue={existing.status}><option value="active">active</option><option value="archived">archived</option></select></label>}
        <button type="submit">{pending ? "処理中…" : existing ? "保存" : "作成"}</button>
      </fieldset>
    </form>
    {existing && <button className="danger" disabled={pending} onClick={() => { if (window.confirm(kind === "organizations" ? "組織を削除しますか？プロジェクトが存在する組織は削除できません。" : "プロジェクトをアーカイブしますか？")) void send("DELETE"); }}>{kind === "organizations" ? "組織を削除" : "アーカイブ"}</button>}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
