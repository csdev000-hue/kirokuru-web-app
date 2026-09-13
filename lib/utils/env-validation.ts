import { z } from "zod";

/** Report field names only: Zod issues may otherwise contain sensitive input. */
export function validateEnvironment<T>(schema: z.ZodType<T>, source: Record<string, string | undefined>): T {
  const normalized = Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, value?.trim() ? value : undefined]),
  );
  const result = schema.safeParse(normalized);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Invalid server environment: ${fields.join(", ")}`);
  }
  return result.data;
}
