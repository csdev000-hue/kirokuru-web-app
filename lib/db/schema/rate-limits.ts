import { pgTable, varchar, integer, timestamp, index } from "drizzle-orm/pg-core";
/** One reusable fixed-window row per hashed subject/policy. No raw IPs or tokens. */
export const rateLimits = pgTable("rate_limits", {
  key: varchar("key", { length: 64 }).primaryKey(),
  hits: integer("hits").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [index("idx_rate_limits_expiry").on(t.expiresAt)]);
