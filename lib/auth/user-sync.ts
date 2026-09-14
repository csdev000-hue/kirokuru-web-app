import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { AccessError } from "@/lib/permissions/errors";

const identitySchema = z.object({
  email: z.email().max(255).transform((email) => email.toLowerCase()),
  emailVerified: z.literal(true),
  name: z.string().trim().min(1).max(100).nullish(),
  avatarUrl: z.url({ protocol: /^https$/ }).nullish(),
}).strict();
/** Only call with an identity verified by the server-side authentication provider. */
export async function synchronizeUser(identity: unknown, db = getDb()) {
  const result = identitySchema.safeParse(identity);
  if (!result.success) throw new AccessError("UNAUTHENTICATED");
  const profile = result.data;
  const updates = {
    ...(profile.name ? { name: profile.name } : {}),
    ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
    updatedAt: new Date(),
  };
  if (!profile.name) {
    // Preserve existing fields; a new NOT NULL name cannot be invented.
    const [existing] = await db.update(users).set(updates).where(eq(users.email, profile.email)).returning();
    if (!existing) throw new AccessError("UNAUTHENTICATED");
    return existing;
  }
  const [user] = await db.insert(users).values({ email: profile.email, name: profile.name, avatarUrl: profile.avatarUrl })
    .onConflictDoUpdate({ target: users.email, set: updates }).returning();
  return user;
}
