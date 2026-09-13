import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";
import { z } from "zod";
import { validateEnvironment } from "./lib/utils/env-validation";

// Schema-only commands never load credentials or require a database connection.
const needsConnection = ["migrate", "push", "pull", "studio"].some((command) => process.argv.includes(command));
let dbCredentials: { url: string; ssl: "verify-full" } | undefined;
if (needsConnection) {
  loadEnvConfig(process.cwd());
  const { DATABASE_URL } = validateEnvironment(z.object({
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  }), process.env);
  dbCredentials = { url: DATABASE_URL, ssl: "verify-full" };
}

export default defineConfig({
  schema: "./lib/db/schema/index.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  ...(dbCredentials ? { dbCredentials } : {}),
});
