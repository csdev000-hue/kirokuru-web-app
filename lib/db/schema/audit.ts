import { pgTable, uuid, varchar, jsonb, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";
import { createdAt, type JsonValue } from "./shared";

// Append-only from application code: no update/delete operation is exposed in Phase 1.
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 100 }).notNull(),
  resourceType: varchar("resource_type", { length: 50 }).notNull(),
  resourceId: uuid("resource_id"),
  metadata: jsonb("metadata").$type<Record<string, JsonValue>>().default({}),
  createdAt: createdAt(),
}, (t) => [index("idx_audit_org_created").on(t.organizationId, t.createdAt.desc())]);
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
