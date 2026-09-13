import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Next.js enforces this boundary in builds; unit tests run outside React Server Components.
vi.mock("server-only", () => ({}));
