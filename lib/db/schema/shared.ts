import { timestamp } from "drizzle-orm/pg-core";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
// Drizzle writes update this value. Direct SQL writers must set updated_at explicitly.
export const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());
