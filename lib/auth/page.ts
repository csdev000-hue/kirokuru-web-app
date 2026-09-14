import "server-only";
import { redirect } from "next/navigation";
import { requireCurrentUser } from "./current-user";
import { AccessError } from "@/lib/permissions/errors";
export async function requirePageUser() {
  try { return await requireCurrentUser(); } catch (error) {
    if (error instanceof AccessError && error.code === "UNAUTHENTICATED") redirect("/login");
    redirect("/login?error=unavailable");
  }
}
