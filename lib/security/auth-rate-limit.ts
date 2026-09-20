import "server-only";
import { configuredLimit, enforceLimit } from "./rate-limit";
/** No client-supplied forwarding headers are trusted. Global OAuth safety budget. */
export async function limitAuthentication() {
  await enforceLimit("auth:global", configuredLimit("RATE_LIMIT_AUTH_PER_MINUTE", 300));
}
