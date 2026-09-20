import { vi } from "vitest";
vi.mock("@/lib/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: vi.fn() }));
vi.mock("@/lib/s3/recording-storage", async (original) => ({ ...await original<typeof import("@/lib/s3/recording-storage")>(), recordingStorage: { createUploadUrl: vi.fn(), headObject: vi.fn(), createDownloadUrl: vi.fn(), deleteObject: vi.fn() } }));
import { recordingSuite } from "../helpers/recording-suite";
recordingSuite(true);
