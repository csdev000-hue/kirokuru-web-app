import { expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";

it("外部サービス設定が空でもHealth Checkが正常応答する", async () => {
  for (const name of ["DATABASE_URL", "AWS_REGION", "BEDROCK_MODEL_ID", "S3_BUCKET_NAME", "LIVEKIT_URL"]) {
    vi.stubEnv(name, "");
  }
  const response = GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ data: { status: "ok" }, requestId: response.headers.get("x-request-id") });
});
