"use server";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "./config";
import { getAuthSettings } from "./settings";
export async function login() {
  if (!getAuthSettings()) redirect("/login?error=unavailable");
  try { await signIn("google", { redirectTo: "/dashboard" }); } catch (error) {
    if (error instanceof AuthError) redirect("/login?error=failed");
    throw error;
  }
}
export async function logout() {
  await signOut({ redirectTo: "/login" });
}
