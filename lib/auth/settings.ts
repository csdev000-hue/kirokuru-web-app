import "server-only";
import { z } from "zod";
const settingsSchema = z.object({
  AUTH_SECRET: z.string().min(32),
  AUTH_GOOGLE_ID: z.string().trim().min(1),
  AUTH_GOOGLE_SECRET: z.string().trim().min(1),
  AUTH_TRUST_HOST: z.enum(["true", "false"]),
  AUTH_URL: z.url({ protocol: /^https?$/ }).refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash && url.pathname === "/" &&
      (url.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  }),
});
export function getAuthSettings() {
  const result = settingsSchema.safeParse(process.env);
  return result.success ? result.data : null;
}
