import "server-only";
import { z } from "zod";
import { AccessError } from "@/lib/permissions/errors";
import { BusinessError, validationError } from "./errors";
/** Auth.js protects its endpoints; application cookie writes additionally require the configured origin. */
export function requireWriteOrigin(request: Request) {
  const configured = process.env.AUTH_URL;
  if (!configured || request.headers.get("origin") !== new URL(configured).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new AccessError("FORBIDDEN");
}
export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  requireWriteOrigin(request);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw validationError();
  const reader = request.body?.getReader();
  if (!reader) throw validationError();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 1_048_576) { await reader.cancel(); throw new BusinessError("PAYLOAD_TOO_LARGE", 413, "入力サイズが上限を超えています。"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw validationError(); }
  const result = schema.safeParse(body);
  if (!result.success) throw validationError();
  return result.data;
}
export function resourceId(value: string) {
  if (!z.uuid().safeParse(value).success) throw new AccessError("RESOURCE_NOT_FOUND");
  return value;
}
export type RouteContext = { params: Promise<{ id: string }> };
