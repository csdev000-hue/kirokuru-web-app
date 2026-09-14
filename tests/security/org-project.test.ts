import { vi } from "vitest";
vi.mock("@/lib/auth/current-user", () => ({ requireCurrentUser: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDb: vi.fn() }));
import { crudSuite } from "../helpers/crud-suite";
crudSuite(true);
