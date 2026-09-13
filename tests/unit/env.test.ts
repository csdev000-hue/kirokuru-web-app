import { describe, expect, it, vi } from "vitest";
import { getBedrockEnv, getDatabaseEnv, getLiveKitEnv, getS3Env, getServerEnv } from "@/lib/env";

describe("server environment", () => {
  it("本番実行時も必須設定の欠落を拒否する", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    expect(getDatabaseEnv).toThrow("DATABASE_URL");
    expect(getServerEnv).toThrow("DATABASE_URL");
  });

  it("DB利用時は他サービスの設定を要求しない", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://example.invalid/test");
    vi.stubEnv("AWS_REGION", "");
    expect(getDatabaseEnv().DATABASE_URL).toBe("postgresql://example.invalid/test");
  });

  it("DB URLにHTTPを受け付けない", () => {
    vi.stubEnv("DATABASE_URL", "https://example.invalid");
    expect(getDatabaseEnv).toThrow("DATABASE_URL");
  });

  it("AWS Role利用時は静的キーを要求しない", () => {
    vi.stubEnv("AWS_REGION", "ap-northeast-1");
    vi.stubEnv("BEDROCK_MODEL_ID", "test-model");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "");
    expect(getBedrockEnv().AWS_ACCESS_KEY_ID).toBeUndefined();
  });

  it("AWSキーの片側のみの設定を拒否する", () => {
    vi.stubEnv("AWS_REGION", "ap-northeast-1");
    vi.stubEnv("S3_BUCKET_NAME", "unit-test-bucket");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "unit-test-key");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "");
    expect(getS3Env).toThrow("AWS_SECRET_ACCESS_KEY");
  });

  it("LiveKitの未設定Secretを拒否する", () => {
    vi.stubEnv("LIVEKIT_URL", "wss://example.invalid");
    vi.stubEnv("LIVEKIT_API_KEY", "unit-test-key");
    vi.stubEnv("LIVEKIT_API_SECRET", "");
    expect(getLiveKitEnv).toThrow("LIVEKIT_API_SECRET");
  });
});
