/** Browser-safe API error presentation; never renders an exception stack/raw response. */
export function apiErrorMessage(response: Pick<Response, "status" | "headers">, body: { requestId?: unknown }, fallback: string) {
  const requestId = typeof body.requestId === "string" && /^[0-9a-f-]{36}$/i.test(body.requestId) ? ` Request ID: ${body.requestId}` : "";
  if (response.status === 429) {
    const retry = response.headers?.get("retry-after");
    return `短時間に操作が集中しています。${retry && /^\d{1,5}$/.test(retry) ? `${retry}秒後に` : "少し時間をおいて"}再度お試しください。${requestId}`;
  }
  if (response.status >= 500) return `処理中にエラーが発生しました。再度お試しください。${requestId}`;
  return fallback;
}
