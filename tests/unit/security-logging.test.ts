import { expect, it, vi } from "vitest";
import { logSecurityEvent } from "@/lib/security/logging";
it("セキュリティログは許可した追跡項目だけを記録", () => {
  const output = vi.spyOn(console, "warn").mockImplementation(() => {});
  const event = { requestId: crypto.randomUUID(), action: "authorize" as const, result: "FORBIDDEN" as const };
  logSecurityEvent(event);
  expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({ event: "security", ...event, level: "warn" });
});
it("ログにToken/任意本文を追加できない", () => {
  const output = vi.spyOn(console, "warn").mockImplementation(() => {});
  const event = { requestId: crypto.randomUUID(), action: "authenticate" as const, result: "UNAUTHENTICATED" as const, sessionToken: "test-sensitive-value" };
  expect(() => logSecurityEvent(event)).toThrow(/^Invalid security event$/);
  expect(output).not.toHaveBeenCalled();
});
