import { ApplicationError } from "@/lib/errors/application-error";
export const ACCESS_ERRORS = {
  UNAUTHENTICATED: { status: 401, message: "ログインしてください。" },
  FORBIDDEN: { status: 403, message: "この操作は許可されていません。" },
  RESOURCE_NOT_FOUND: { status: 404, message: "対象が見つかりません。" },
} as const;
export type AccessErrorCode = keyof typeof ACCESS_ERRORS;
export class AccessError extends ApplicationError {
  readonly status: number;
  constructor(readonly code: AccessErrorCode) {
    super(code, ACCESS_ERRORS[code].status, ACCESS_ERRORS[code].message);
    this.name = "AccessError";
    this.status = ACCESS_ERRORS[code].status;
  }
}
