import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, text, primaryKey, check, index } from "drizzle-orm/pg-core";
import { users } from "./users";
import { organizations } from "./organizations";
import { createdAt, updatedAt } from "./shared";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 20, enum: ["active", "archived"] }).notNull().default("active"),
  createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  check("projects_status_check", sql`${t.status} in ('active', 'archived')`),
  index("idx_projects_org_status").on(t.organizationId, t.status),
]);
export const projectMembers = pgTable("project_members", {
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "restrict" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  role: varchar("role", { length: 20, enum: ["owner", "member", "viewer"] }).notNull().default("member"),
  createdAt: createdAt(),
}, (t) => [
  primaryKey({ columns: [t.projectId, t.userId] }),
  check("project_members_role_check", sql`${t.role} in ('owner', 'member', 'viewer')`),
  index("idx_project_members_user").on(t.userId),
]);
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;
