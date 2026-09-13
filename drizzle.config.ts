import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";
import { z } from "zod";
import { validateEnvironment } from "./lib/utils/env-validation";

loadEnvConfig(process.cwd());
const { DATABASE_URL } = validateEnvironment(z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
}), process.env);

export default defineConfig({
  schema: "./lib/db/schema/index.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: { url: DATABASE_URL, ssl: "verify-full" },
});
