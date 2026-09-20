import { logEvent } from "@/lib/logging/logger";
import "server-only";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { getAuthSettings } from "./settings";
import { synchronizeUser } from "./user-sync";
import { safeAuthRedirect } from "./redirect";
import "./types";

export function createAuthConfig(): NextAuthConfig {
  const settings = getAuthSettings();
  return {
    providers: settings ? [Google({ clientId: settings.AUTH_GOOGLE_ID, clientSecret: settings.AUTH_GOOGLE_SECRET })] : [],
    secret: settings?.AUTH_SECRET,
    trustHost: settings?.AUTH_TRUST_HOST === "true",
    session: { strategy: "jwt", maxAge: 60 * 60 },
    pages: { signIn: "/login", error: "/login" },
    // Auth.js may pass provider responses/tokens in error causes; never log them.
    logger: { error() { logEvent({ event: "authentication_failed" }, "warn"); }, warn() {}, debug() {} },
    callbacks: {
      async signIn({ account, profile }) {
        return account?.provider === "google" && profile?.email_verified === true && typeof profile.email === "string";
      },
      async jwt({ token, account, profile }) {
        if (account) {
          if (account.provider !== "google" || profile?.email_verified !== true) return null;
          const user = await synchronizeUser({ email: profile.email, emailVerified: true, name: profile.name, avatarUrl: profile.picture });
          // Provider subject and tokens are not carried into application sessions.
          return { appUserId: user.id };
        }
        // Ignore client session-update payloads entirely.
        return token.appUserId ? { appUserId: token.appUserId } : null;
      },
      session({ session, token }) {
        return { expires: session.expires, appUserId: token.appUserId };
      },
      redirect: ({ url, baseUrl }) => safeAuthRedirect(url, baseUrl),
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(createAuthConfig);
