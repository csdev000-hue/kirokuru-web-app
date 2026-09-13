import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { getDatabaseEnv } from "@/lib/env";
import * as schema from "./schema";

function createDatabase() {
  const { DATABASE_URL } = getDatabaseEnv();
  const sql = postgres(DATABASE_URL, {
    ssl: "verify-full",
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(sql, { schema });
}

const databaseGlobal = globalThis as typeof globalThis & {
  kirokuruDatabase?: ReturnType<typeof createDatabase>;
};

export function getDb() {
  return databaseGlobal.kirokuruDatabase ??= createDatabase();
}
