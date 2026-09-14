import { withCurrentUser } from "@/lib/auth/api";
export const GET = withCurrentUser((user) => Response.json({ data: user }));
