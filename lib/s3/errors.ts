import "server-only";
import { BusinessError } from "@/lib/api/errors";
export function s3Error(error: unknown): BusinessError {
 const name = error && typeof error === "object" && "name" in error ? error.name : "";
 return new BusinessError("S3_PROVIDER_ERROR", name === "TimeoutError" || name === "AbortError" ? 504 : 502, "録音ストレージに接続できません。時間をおいて再試行してください。");
}
export function isMissingObject(error: unknown) {
 if (!error || typeof error !== "object") return false;
 const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
 return e.name === "NotFound" || e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404;
}
