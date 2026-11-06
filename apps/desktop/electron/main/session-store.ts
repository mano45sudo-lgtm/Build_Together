/**
 * Desktop session token holder (ADR-0003 §4, ADR-0006). The MAIN process is the sole authenticated
 * API caller, so it must hold the bearer token that `api-client` attaches to every request. With
 * Clerk that token is a SHORT-LIVED session JWT (~60s) the renderer obtains via
 * `@clerk/electron/react` `getToken()` and pushes over the typed `auth.syncToken` IPC channel.
 *
 * This holder is deliberately IN-MEMORY ONLY. Clerk's own Electron bridge (`createClerkBridge({
 * storage })`) persists the long-lived client/refresh tokens at rest via `safeStorage`; we never
 * duplicate that here, and we never persist this ephemeral JWT. It is cleared on sign-out / expiry.
 *
 * SECURITY: this value is the transient bearer token. It is never logged and never returned to the
 * renderer — the renderer already had it (it minted it); main only caches it for outbound API calls.
 */

let current: string | null = null;

/** Replace (or clear, with `null`) the in-memory Clerk session JWT main will attach to API calls. */
export function setClerkToken(token: string | null): void {
  current = token;
}

/** The current Clerk session JWT, or `null` when no session is synced. */
export function getClerkToken(): string | null {
  return current;
}
