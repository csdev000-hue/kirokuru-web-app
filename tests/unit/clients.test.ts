import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  postgres: vi.fn(function () { return {}; }),
  drizzle: vi.fn(() => ({ database: "mock" })),
  bedrock: vi.fn(function () {}),
  s3: vi.fn(function () {}),
  liveKit: vi.fn(function () {}),
}));
vi.mock("postgres", () => ({ default: mocks.postgres }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: mocks.drizzle }));
vi.mock("@aws-sdk/client-bedrock-runtime", () => ({ BedrockRuntimeClient: mocks.bedrock }));
vi.mock("@aws-sdk/client-s3", () => ({ S3Client: mocks.s3 }));
vi.mock("livekit-server-sdk", () => ({ RoomServiceClient: mocks.liveKit }));

describe("server clients (network mocked)", () => {
  beforeEach(() => { vi.resetModules(); });

  it("Secret未設定でもimport時はクライアントを生成しない", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("AWS_REGION", "");
    vi.stubEnv("LIVEKIT_URL", "");
    await Promise.all([
      import("@/lib/db/client"), import("@/lib/bedrock/client"),
      import("@/lib/s3/client"), import("@/lib/livekit/client"),
    ]);
    for (const mock of Object.values(mocks)) expect(mock).not.toHaveBeenCalled();
  });

  it("DBクライアントはTLS検証と接続制限を設定し再利用する", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://example.invalid/test");
    const { getDb } = await import("@/lib/db/client");
    expect(getDb()).toBe(getDb());
    expect(mocks.postgres).toHaveBeenCalledOnce();
    expect(mocks.postgres).toHaveBeenCalledWith("postgresql://example.invalid/test", expect.objectContaining({
      ssl: "verify-full", max: 1, prepare: false,
    }));
  });

  it("BedrockとS3は必要な設定を検証してクライアントを再利用する", async () => {
    vi.stubEnv("AWS_REGION", "ap-northeast-1");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "");
    vi.stubEnv("BEDROCK_MODEL_ID", "test-model");
    vi.stubEnv("S3_BUCKET_NAME", "unit-test-bucket");
    const { getBedrockClient } = await import("@/lib/bedrock/client");
    const { getS3Client } = await import("@/lib/s3/client");
    expect(getBedrockClient()).toBe(getBedrockClient());
    expect(getS3Client()).toBe(getS3Client());
    expect(mocks.bedrock).toHaveBeenCalledOnce();
    expect(mocks.s3).toHaveBeenCalledOnce();
  });

  it("LiveKit管理APIではwssをhttpsに変換する", async () => {
    vi.stubEnv("LIVEKIT_URL", "wss://example.invalid");
    vi.stubEnv("LIVEKIT_API_KEY", "unit-test-key");
    vi.stubEnv("LIVEKIT_API_SECRET", "unit-test-secret");
    const { getLiveKitClient } = await import("@/lib/livekit/client");
    expect(getLiveKitClient()).toBe(getLiveKitClient());
    expect(mocks.liveKit).toHaveBeenCalledWith("https://example.invalid/", "unit-test-key", "unit-test-secret");
  });

  it("AI生成は成功を偽装せず未実装エラーを返す", async () => {
    const { generateStructured } = await import("@/lib/bedrock/client");
    await expect(generateStructured({ systemPrompt: "test", userPrompt: "test", schema: z.object({}) }))
      .rejects.toThrow("not implemented in Phase 0");
    expect(mocks.bedrock).not.toHaveBeenCalled();
  });
});
