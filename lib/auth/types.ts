export type CurrentUser = { id: string; email: string; name: string };
declare module "next-auth" {
  interface Session { appUserId?: string }
}
declare module "next-auth/jwt" {
  interface JWT { appUserId?: string }
}
