import "server-only";
import { auth } from "./config";
import { getAuthSettings } from "./settings";
export async function getApplicationSession() {
  if (!getAuthSettings()) return null;
  return auth();
}
