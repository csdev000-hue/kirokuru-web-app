import { vi } from "vitest";
vi.mock("@/lib/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: vi.fn() }));
vi.mock("@/lib/bedrock/structured-ai-client", () => ({ createStructuredAIClient: vi.fn() }));
import { minutesSuite } from "../helpers/minutes-suite";
minutesSuite(true);
