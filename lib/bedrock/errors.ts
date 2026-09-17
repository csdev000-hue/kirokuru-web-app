import { BusinessError } from "@/lib/api/errors";
export const aiError = (code: "AI_PROVIDER_ERROR" | "AI_TIMEOUT" | "AI_RATE_LIMITED" | "AI_INVALID_JSON" | "AI_SCHEMA_INVALID" | "AI_CONTEXT_TOO_LARGE") => new BusinessError(code, code === "AI_TIMEOUT" ? 504 : code === "AI_RATE_LIMITED" ? 429 : code === "AI_CONTEXT_TOO_LARGE" ? 422 : 502, "AI議事録を生成できませんでした。入力や設定を確認して再試行してください。");
