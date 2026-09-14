export class BusinessError extends Error {
  constructor(public readonly code: "VALIDATION_ERROR" | "ORGANIZATION_NOT_EMPTY" | "PAYLOAD_TOO_LARGE", public readonly status: number, message: string) { super(message); }
}
export const validationError = () => new BusinessError("VALIDATION_ERROR", 400, "入力内容を確認してください。");
