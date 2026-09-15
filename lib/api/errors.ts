export class BusinessError extends Error {
  constructor(public readonly code: "MEETING_NOT_EMPTY" | "INVALID_TRANSITION" | "MEETING_READ_ONLY" | "INVALID_PARTICIPANT" | "PARTICIPANT_EXISTS" | "LAST_HOST_REQUIRED" | "INVALID_SPEAKER" | "TRANSCRIPT_SEQUENCE_CONFLICT" | "TRANSCRIPT_REFERENCED" | "INVALID_AI_CONTEXT" | "INVALID_ASSIGNEE" | "PROJECT_ARCHIVED" | "VALIDATION_ERROR" | "ORGANIZATION_NOT_EMPTY" | "PAYLOAD_TOO_LARGE", public readonly status: number, message: string) { super(message); }
}
export const validationError = () => new BusinessError("VALIDATION_ERROR", 400, "入力内容を確認してください。");
