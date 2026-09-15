import { vi } from "vitest";
vi.mock("@/lib/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: vi.fn() }));
import { ticketSuite } from "../helpers/ticket-suite";
ticketSuite(false);
