/** Matches docs/design/api-design.md: requestId belongs at the response root. */
export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: ReadonlyArray<{ field: string; reason: string }>;
  };
  requestId?: string;
};

/** Unknown exceptions must never be serialized into a client response. */
export function createInternalErrorResponse(requestId?: string): ApiErrorResponse {
  return {
    error: { code: "INTERNAL_ERROR", message: "予期しないエラーが発生しました。" },
    ...(requestId ? { requestId } : {}),
  };
}
