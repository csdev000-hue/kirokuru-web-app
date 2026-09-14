import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, primaryKey, check, index, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
import { createdAt, updatedAt } from "./shared";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
export const organizationMembers = pgTable("organization_members", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  role: varchar("role", { length: 20, enum: ["owner", "member"] }).notNull().default("member"),
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.organizationId, t.userId] }),
  check("organization_members_role_check", sql`${t.role} in ('owner', 'member')`),
  index("idx_org_members_user").on(t.userId),
]);
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type NewOrganizationMember = typeof organizationMembers.$inferInsert;
