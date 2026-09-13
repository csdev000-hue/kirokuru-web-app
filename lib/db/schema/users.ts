import { pgTable, uuid, varchar, text } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./shared";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
