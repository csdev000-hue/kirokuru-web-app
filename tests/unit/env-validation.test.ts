import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validateEnvironment } from "@/lib/utils/env-validation";

describe("validateEnvironment utility", () => {
  const schema = z.object({ REQUIRED: z.string().min(1), OPTIONAL: z.string().optional() });

  it("正常値を返し、空の任意設定は未設定として扱う", () => {
    expect(validateEnvironment(schema, { REQUIRED: "value", OPTIONAL: " " }))
      .toEqual({ REQUIRED: "value", OPTIONAL: undefined });
  });

  it.each([undefined, "", " "])("必須値が %s なら拒否する", (value) => {
    expect(() => validateEnvironment(schema, { REQUIRED: value })).toThrow("Invalid server environment: REQUIRED");
  });

  it("設定値やZodの内部エラー文を例外に含めない", () => {
    const secret = "unit-test-sensitive-value";
    const schema = z.object({ SECRET: z.string().refine(() => false, secret) });
    expect(() => validateEnvironment(schema, { SECRET: secret }))
      .toThrow(/^Invalid server environment: SECRET$/);
  });
});
