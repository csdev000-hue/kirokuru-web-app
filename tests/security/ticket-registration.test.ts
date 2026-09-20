import { vi } from "vitest";
vi.mock("@/lib/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: vi.fn() }));
import { registrationSuite } from "../helpers/registration-suite";
registrationSuite(true);
