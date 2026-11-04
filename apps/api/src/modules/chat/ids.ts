import { randomBytes } from 'node:crypto';

/**
 * Deterministic, provider-safe identifier helpers (ADR-0004 identity mapping).
 *
 * - A Nexconn **user id** must be stable and impersonation-proof: we derive it from the
 *   BuildTogether `userId` (the single source of truth) rather than email or any user-chosen value.
 *   The prefix namespaces our identities on the provider; the cuid body is already unique.
 * - A Nexconn **group channel id** has provider constraints (verified from the SDK typings: must not
 *   contain `_`, length ≤ 20). BuildTogether cuids are 24 chars, so we mint a short, collision-safe
 *   slug instead of reusing the conversation id.
 */

/** Nexconn-safe user id for a BuildTogether user (`bt-` + cuid; alphanumerics and `-` only). */
export function externalIdForUser(userId: string): string {
  return `bt-${userId}`;
}

/** A Nexconn-safe group channel id: `grp` + 16 hex chars = 19 chars, no underscore. */
export function newProviderChannelId(): string {
  return `grp${randomBytes(8).toString('hex')}`;
}
