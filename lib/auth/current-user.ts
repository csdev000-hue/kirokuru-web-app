import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { AccessError } from "@/lib/permissions/errors";
import { getApplicationSession } from "./session";
import type { CurrentUser } from "./types";

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getApplicationSession();
  const id = z.uuid().safeParse(session?.appUserId);
  if (!id.success) return null;
  const [user] = await getDb().select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.id, id.data)).limit(1);
  return user ?? null;
}
export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) throw new AccessError("UNAUTHENTICATED");
  return user;
}
