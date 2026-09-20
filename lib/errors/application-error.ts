/** Only explicitly safe application messages may cross the API boundary. */
export class ApplicationError extends Error {
  constructor(readonly code: string, readonly status: number, message: string, readonly expose = true, readonly retryAfterSeconds?: number) {
    super(message);
    this.name = "ApplicationError";
  }
  get statusCode() { return this.status; }
}
export function databaseError(error: unknown): ApplicationError | undefined {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    const code = "code" in current ? current.code : undefined;
    if (["23505", "23503", "23514", "40001", "40P01"].includes(String(code))) return new ApplicationError("CONFLICT", 409, "関連データが変更されています。内容を確認して再試行してください。");
    if (typeof code === "string" && (/^08/.test(code) || ["57P01", "53300", "ECONNREFUSED", "ETIMEDOUT"].includes(code))) return new ApplicationError("SERVICE_UNAVAILABLE", 503, "現在サービスを利用できません。時間をおいて再試行してください。");
    current = "cause" in current ? current.cause : undefined;
  }
}
