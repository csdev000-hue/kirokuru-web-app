"use server";
import { limitAuthentication } from "@/lib/security/auth-rate-limit";
import { ApplicationError } from "@/lib/errors/application-error";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "./config";
import { getAuthSettings } from "./settings";
export async function login() {
  if (!getAuthSettings()) redirect("/login?error=unavailable");
  try { await limitAuthentication(); await signIn("google", { redirectTo: "/dashboard" }); } catch (error) {
    if (error instanceof AuthError || error instanceof ApplicationError) redirect("/login?error=failed");
    throw error;
  }
}
export async function logout() {
  await signOut({ redirectTo: "/login" });
}
