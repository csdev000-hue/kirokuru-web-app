// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const mocks = vi.hoisted(() => ({ disconnect: vi.fn(async () => {}), push: vi.fn(), state: "connected" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: vi.fn() }) }));
vi.mock("@livekit/components-react", () => ({
 setLogLevel: vi.fn(),
 PreJoin: ({ onError, onSubmit }: { onError: () => void; onSubmit: (v: object) => void }) => <div><button onClick={onError}>端末拒否</button><button onClick={() => onSubmit({ audioEnabled: true, videoEnabled: false })}>プレビューから参加</button></div>,
 LiveKitRoom: ({ children, onConnected, onDisconnected, onError }: { children: ReactNode; onConnected: () => void; onDisconnected: () => void; onError: () => void }) => <div><button onClick={onConnected}>接続イベント</button><button onClick={onDisconnected}>切断イベント</button><button onClick={onError}>接続失敗イベント</button>{children}</div>,
 GridLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>, ParticipantTile: () => <span>映像タイル</span>, RoomAudioRenderer: () => <span data-testid="remote-audio">音声レンダラー</span>, StartAudio: () => null,
 TrackToggle: ({ children, onDeviceError }: { children: ReactNode; onDeviceError: () => void }) => <button onClick={onDeviceError}>{children}</button>,
 useTracks: () => [], useParticipants: () => [{ identity: "user_a", name: "<script>attack</script>", isLocal: true, isMicrophoneEnabled: true, isCameraEnabled: false, connectionQuality: "excellent" }, { identity: "user_b", name: "Remote", isLocal: false, isMicrophoneEnabled: false, isCameraEnabled: false, connectionQuality: "good" }],
 useConnectionState: () => mocks.state, useRoomContext: () => ({ disconnect: mocks.disconnect, on: vi.fn(), off: vi.fn() }),
}));
import { LiveMeetingRoom } from "@/components/meetings/live-room";
beforeEach(() => { mocks.state = "connected"; vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: { token: "PRIVATE", serverUrl: "wss://test.invalid", canPublish: true } }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("device denial leaves listen-only join available; successful connect records join; participants escaped", async () => {
 render(<LiveMeetingRoom id="meeting" displayName="User" canPublish />); fireEvent.click(screen.getByText("端末拒否")); expect(screen.getByRole("alert")).toHaveTextContent("マイク・カメラを使用できません");
 fireEvent.click(screen.getByText("視聴のみで参加")); await screen.findByText("接続イベント"); fireEvent.click(screen.getByText("接続イベント")); await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/meetings/meeting/join", expect.anything()));
 expect(screen.getByTestId("remote-audio")).toBeVisible(); expect(screen.getByText("参加者 2人")).toBeVisible(); expect(document.querySelector("script")).toBeNull();
 fireEvent.click(screen.getByText("自分だけ退出")); await waitFor(() => expect(mocks.disconnect).toHaveBeenCalled()); expect(fetch).toHaveBeenCalledWith("/api/meetings/meeting/leave", expect.anything());
});
it("viewer API grant hides publishing even when client prop was stale", async () => {
 vi.mocked(fetch).mockResolvedValue(Response.json({ data: { token: "PRIVATE", serverUrl: "wss://test.invalid", canPublish: false } }));
 render(<LiveMeetingRoom id="meeting" displayName="User" canPublish />); fireEvent.click(screen.getByText("視聴のみで参加")); await screen.findByText("接続イベント");
 expect(screen.queryByText("画面共有")).toBeNull(); expect(screen.queryByText("全員の会議を終了")).toBeNull();
});
it("permanent disconnect clears session and allows fresh token request", async () => {
 render(<LiveMeetingRoom id="meeting" displayName="User" canPublish={false} />); fireEvent.click(screen.getByText("視聴のみで参加")); await screen.findByText("切断イベント"); fireEvent.click(screen.getByText("切断イベント")); await screen.findByText("視聴のみで参加");
 fireEvent.click(screen.getByText("視聴のみで参加")); await screen.findByText("接続イベント"); expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith("/token"))).toHaveLength(2);
});
it("reconnecting is displayed without forcing leave; connection failure permits retry", async () => {
 mocks.state = "reconnecting"; render(<LiveMeetingRoom id="meeting" displayName="User" canPublish={false} />); fireEvent.click(screen.getByText("視聴のみで参加")); await screen.findByText(/再接続しています/);
 fireEvent.click(screen.getByText("接続失敗イベント")); await screen.findByText("視聴のみで参加"); expect(screen.getByRole("alert")).toHaveTextContent("接続に失敗");
});
