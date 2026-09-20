"use client";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { recordingContentTypeSchema } from "@/lib/validators/recording";
type Recording = { id: string; contentType: string; fileSize: number | null; durationSeconds: number | null; status: string; createdAt: string; uploadedAt: string | null };
const subscribe = () => () => {};
const size = (bytes: number | null) => bytes === null ? "未確認" : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
async function api(path: string, body = {}, method = "POST") {
 const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
 const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? "録音操作に失敗しました。"); return result.data;
}
function put(url: string, headers: Record<string, string>, file: File, progress: (percent: number) => void) {
 return new Promise<void>((resolve, reject) => {
  const xhr = new XMLHttpRequest(); xhr.open("PUT", url); xhr.timeout = 15 * 60 * 1000;
  for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
  xhr.upload.onprogress = (e) => { if (e.lengthComputable) progress(Math.round(e.loaded / e.total * 100)); };
  xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("アップロードに失敗しました。完了確認または再試行を行ってください。"));
  xhr.onerror = xhr.ontimeout = () => reject(new Error("アップロードに失敗しました。通信状態を確認してください。")); xhr.send(file);
 });
}
export function Recordings({ meetingId, recordings, canWrite, maxBytes, nextPage, page }: { meetingId: string; recordings: Recording[]; canWrite: boolean; maxBytes: number; nextPage: number | null; page: number }) {
 const ready = useSyncExternalStore(subscribe, () => true, () => false);
 const router = useRouter(); const [file, setFile] = useState<File | null>(null); const [retryId, setRetryId] = useState<string | null>(null);
 const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(0); const [error, setError] = useState(""); const [player, setPlayer] = useState<{ id: string; url: string } | null>(null);
 async function action(work: () => Promise<void>) { setBusy(true); setError(""); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "録音操作に失敗しました。"); } finally { router.refresh(); setBusy(false); } }
 async function upload() {
  if (!file) throw new Error("録音ファイルを選択してください。");
  if (!recordingContentTypeSchema.safeParse(file.type).success) throw new Error("対応する音声・動画形式を選択してください。");
  if (file.size <= 0 || file.size > maxBytes) throw new Error("録音ファイルの容量を確認してください。");
  setProgress(0);
  const data = retryId ? await api(`/api/recordings/${retryId}/upload-url`) : await api(`/api/meetings/${meetingId}/recordings/upload-url`, { contentType: file.type, fileSize: file.size });
  setRetryId(data.recordingId);
  await put(data.uploadUrl, data.headers, file, setProgress);
  await api(`/api/recordings/${data.recordingId}/complete`); setRetryId(null); setProgress(100);
 }
 return <section aria-label="録音"><h2>録音</h2>
 {canWrite && <div><label>録音ファイル<input aria-label="録音ファイル" type="file" accept="audio/webm,audio/mp4,audio/mpeg,audio/wav,video/webm,video/mp4" disabled={busy || !ready} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRetryId(null); }} /></label><p>上限 {size(maxBytes)}。音声 WebM / M4A / MP3 / WAV、動画 WebM / MP4。</p>
 <button disabled={busy || !file} onClick={() => action(upload)}>{retryId ? "アップロードを再試行" : "録音ファイルをアップロード"}</button>
 {retryId && <button disabled={busy} onClick={() => action(async () => { await api(`/api/recordings/${retryId}/complete`); setRetryId(null); })}>アップロード完了を確認</button>}
 <progress aria-label="アップロード進捗" value={progress} max={100} /><span>{progress}%</span></div>}
 {!canWrite && <p>録音は閲覧のみ可能です。</p>}{busy && <p role="status">録音を処理しています…</p>}{error && <p role="alert">{error}</p>}
 {recordings.length === 0 && <p>録音はまだありません</p>}
 <ul>{recordings.map((r) => <li key={r.id}><p>{r.contentType} · {size(r.fileSize)} · 長さ: {r.durationSeconds === null ? "未取得" : `${r.durationSeconds}秒`} · 状態: {r.status}</p><p>登録: {new Date(r.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} · 完了: {r.uploadedAt ? new Date(r.uploadedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "未完了"}</p>
 {["uploaded", "processing", "completed"].includes(r.status) && <><button disabled={busy} onClick={() => action(async () => { const data = await api(`/api/recordings/${r.id}/download-url`); setPlayer({ id: r.id, url: data.downloadUrl }); })}>録音を再生・取得</button>{player?.id === r.id && <div>{r.contentType.startsWith("video/") ? <video controls src={player.url} onError={() => setError("再生できない場合は、再生・取得ボタンからURLを再取得してください。")} /> : <audio controls src={player.url} onError={() => setError("再生できない場合は、再生・取得ボタンからURLを再取得してください。")} />}<a href={player.url} download rel="noreferrer" referrerPolicy="no-referrer">録音をダウンロード</a></div>}</>}
 {canWrite && r.status === "uploading" && <button disabled={busy} onClick={() => action(async () => { await api(`/api/recordings/${r.id}/complete`); if (retryId === r.id) setRetryId(null); })}>完了確認</button>}
 {canWrite && !["processing", "completed"].includes(r.status) && <button disabled={busy} onClick={() => { if (window.confirm("録音を削除しますか？文字起こし・議事録がある場合は削除できません。")) void action(async () => { await api(`/api/recordings/${r.id}`, {}, "DELETE"); if (player?.id === r.id) setPlayer(null); if (retryId === r.id) setRetryId(null); }); }}>録音を削除</button>}</li>)}</ul>
 <nav>{page > 1 && <a href={`?recordingPage=${page - 1}`}>前の録音</a>}{nextPage && <a href={`?recordingPage=${nextPage}`}>次の録音</a>}</nav></section>;
}
