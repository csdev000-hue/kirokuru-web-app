"use client";
import { useEffect, useState } from "react";
import { liveApi } from "./live-actions";
import { useRouter } from "next/navigation";
import { LiveKitRoom, PreJoin, GridLayout, ParticipantTile, RoomAudioRenderer, TrackToggle, useTracks, useParticipants, useConnectionState, useRoomContext, StartAudio, setLogLevel } from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
// Never forward SDK diagnostics (which can include signalling details) to analytics/console.
setLogLevel("silent");
const roomOptions = { adaptiveStream: true, dynacast: true };
type Session = { token: string; serverUrl: string; canPublish: boolean; audio: boolean | { deviceId: string }; video: boolean | { deviceId: string } };
export function LiveMeetingRoom({ id, displayName, canPublish }: { id: string; displayName: string; canPublish: boolean }) {
 const [session, setSession] = useState<Session | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [attempt, setAttempt] = useState(0);
 async function join(audio = false, video = false, audioDeviceId = "", videoDeviceId = "") {
  if (busy) return; setBusy(true); setError("");
  try { const data = await liveApi(id, "token"); setAttempt((n) => n + 1); setSession({ ...data, audio: data.canPublish && audio ? { deviceId: audioDeviceId || "default" } : false, video: data.canPublish && video ? { deviceId: videoDeviceId || "default" } : false }); }
  catch (e) { setError(e instanceof Error ? e.message : "会議への接続に失敗しました。"); } finally { setBusy(false); }
 }
 const mediaError = () => setError("マイク・カメラを使用できません。権限や接続を確認してください。視聴のみでも参加できます。");
 return <section aria-label="オンライン会議" data-lk-theme="default">
 {error && <p role="alert">{error}</p>}
 {!session ? <><h2>参加前のデバイス確認</h2><p>マイクとカメラは初期状態でOFFです。表示名はアカウント情報を使用します。</p>
 {canPublish && <fieldset disabled={busy}><PreJoin defaults={{ username: displayName, audioEnabled: false, videoEnabled: false }} persistUserChoices={false} userLabel="表示名（接続時はアカウント名）" micLabel="マイク" camLabel="カメラ" joinLabel="会議に参加" onError={mediaError} onSubmit={(v) => void join(v.audioEnabled, v.videoEnabled, v.audioDeviceId, v.videoDeviceId)} /></fieldset>}
 <button disabled={busy} onClick={() => void join()}>視聴のみで参加</button>{busy && <p role="status">参加情報を取得しています…</p>}</> : <>
 <LiveKitRoom key={attempt} token={session.token} serverUrl={session.serverUrl} options={roomOptions} audio={session.audio} video={session.video}
 onConnected={() => { void liveApi(id, "join").catch(() => { setError("参加の記録に失敗しました。退出して再参加してください。"); setSession(null); }); }}
 onDisconnected={() => { void liveApi(id, "connection-event", { state: "disconnected" }).catch(() => {}); setSession(null); setError("会議から切断されました。終了済みの場合は会議詳細へ戻ってください。"); void liveApi(id, "leave").catch(() => {}); }}
 onError={() => { void liveApi(id, "connection-event", { state: "failed" }).catch(() => {}); setError("会議への接続に失敗しました。時間をおいて再参加してください。"); setSession(null); }} onMediaDeviceFailure={mediaError}>
 <RoomContent id={id} canPublish={session.canPublish} onError={setError} onLeft={() => setSession(null)} />
 </LiveKitRoom></>}
 </section>;
}
function RoomContent({ id, canPublish, onError, onLeft }: { id: string; canPublish: boolean; onError: (message: string) => void; onLeft: () => void }) {
 const room = useRoomContext(); const state = useConnectionState(); const participants = useParticipants(); const router = useRouter();
 const [seconds, setSeconds] = useState(0); const [busy, setBusy] = useState(false); const [reconnects, setReconnects] = useState(0);
 const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }, { source: Track.Source.ScreenShare, withPlaceholder: false }]);
 useEffect(() => { const timer = setInterval(() => setSeconds((n) => n + 1), 1000); return () => clearInterval(timer); }, []);
 useEffect(() => {
  const reconnect = () => { setReconnects((n) => n + 1); void liveApi(id, "connection-event", { state: "reconnecting" }).catch(() => {}); };
  const reconnected = () => { void liveApi(id, "connection-event", { state: "reconnected" }).catch(() => {}); };
  room.on("reconnecting", reconnect); room.on("reconnected", reconnected);
  return () => { room.off("reconnecting", reconnect); room.off("reconnected", reconnected); };
 }, [room, id]);
 async function exit(end: boolean) {
  if (end && !window.confirm("会議を終了しますか？参加者全員が退出します。")) return;
  setBusy(true);
  try { if (end) await liveApi(id, "end"); await room.disconnect(); await liveApi(id, "leave"); onLeft(); router.push(`/meetings/${id}`); }
  catch { onError(end ? "会議終了に失敗しました。再試行してください。" : "退出履歴を記録できませんでした。会議詳細で確認してください。"); }
  finally { setBusy(false); }
 }
 return <><p role="status">接続状態: {state} {state === "reconnecting" && "再接続しています…"} · 接続時間 {seconds}秒 · 再接続 {reconnects}回</p>
 <div style={{ height: "min(65vh, 600px)" }}><GridLayout tracks={tracks}><ParticipantTile /></GridLayout></div><RoomAudioRenderer /><StartAudio label="会議の音声を再生" />
 <section aria-label="参加者"><h2>参加者 {participants.length}人</h2><ul>{participants.map((p) => <li key={p.identity}>{p.name || "参加者"} · {p.isLocal ? "自分" : "リモート"} · マイク {p.isMicrophoneEnabled ? "ON" : "OFF"} · カメラ {p.isCameraEnabled ? "ON" : "OFF"} · 接続品質 {p.connectionQuality}</li>)}</ul></section>
 {canPublish && <><TrackToggle source={Track.Source.Microphone} onDeviceError={() => onError("マイクを使用できません。")} aria-label="マイク切替">マイク</TrackToggle><TrackToggle source={Track.Source.Camera} onDeviceError={() => onError("カメラを使用できません。")} aria-label="カメラ切替">カメラ</TrackToggle><TrackToggle source={Track.Source.ScreenShare} onDeviceError={() => onError("画面共有を開始できません。共有の許可を確認してください。")} aria-label="画面共有切替">画面共有</TrackToggle></>}
 <button disabled={busy} onClick={() => void exit(false)}>自分だけ退出</button>{canPublish && <button disabled={busy} onClick={() => void exit(true)}>全員の会議を終了</button>}</>;
}
