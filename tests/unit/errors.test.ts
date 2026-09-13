import { expect, it } from "vitest";
import { createInternalErrorResponse } from "@/lib/errors";

it("内部エラーの応答は固定メッセージと追跡IDのみを持つ", () => {
  expect(createInternalErrorResponse("req-test")).toEqual({
    error: { code: "INTERNAL_ERROR", message: "予期しないエラーが発生しました。" },
    requestId: "req-test",
  });
});

it("追跡ID未指定時は省略する", () => {
  expect(createInternalErrorResponse()).not.toHaveProperty("requestId");
});
