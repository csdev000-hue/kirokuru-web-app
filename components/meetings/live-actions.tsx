"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export async function liveApi(id: string, action: string, body: object = {}) {
 const response = await fetch(`/api/meetings/${id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
 const data = await response.json(); if (!response.ok) throw new Error(data.error?.message ?? "会議操作に失敗しました。"); return data.data;
}
export function LiveStart({ id, started, ending = false }: { id: string; started: boolean; ending?: boolean }) {
 const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
 return <div><button disabled={busy} onClick={async () => {
  if ((started || ending) && !window.confirm("会議を終了しますか？参加者全員が退出します。")) return;
  setBusy(true); setError(""); try { await liveApi(id, started || ending ? "end" : "start"); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : "会議操作に失敗しました。"); } finally { setBusy(false); }
 }}>{ending ? "会議終了を再試行" : started ? "オンライン会議を終了" : "オンライン会議を開始"}</button>{error && <p role="alert">{error}</p>}</div>;
}
