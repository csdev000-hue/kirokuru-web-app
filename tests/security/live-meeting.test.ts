import { vi } from "vitest";
vi.mock("@/lib/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: vi.fn() }));
vi.mock("@/lib/livekit/provider", () => ({ liveKitError: () => new BusinessError("LIVEKIT_PROVIDER_ERROR", 502, "会議サーバーに接続できません。"), liveMeetingProvider: { ensureRoom: vi.fn(), endRoom: vi.fn(), hasParticipant: vi.fn(), createParticipantToken: vi.fn() } }));
import { BusinessError } from "@/lib/api/errors";
import { liveMeetingSuite } from "../helpers/live-meeting-suite";
liveMeetingSuite(true);
