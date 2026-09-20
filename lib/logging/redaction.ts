const sensitive = /password|token|authorization|cookie|secret|api.?key|access.?key|presigned|database.?url|prompt|transcript|raw.?output|raw.?response/i;
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[REDACTED]";
  if (value instanceof Error) return { errorType: "Error" };
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sensitive.test(k) && !["inputTokens", "outputTokens", "promptVersion"].includes(k) ? "[REDACTED]" : redact(v, depth + 1)]));
  if (typeof value === "string" && /(?:https?|wss?|postgres(?:ql)?):\/\/|\beyJ[A-Za-z0-9_-]+\.|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(value)) return "[REDACTED]";
  return value;
}
