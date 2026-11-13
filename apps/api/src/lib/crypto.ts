import { createHash, randomBytes, randomUUID } from 'node:crypto';

/**
 * Cryptographic helpers for session/invitation tokens. Uses Node's standard crypto only —
 * this is NOT custom cryptography, just correct use of vetted primitives (ADR-0003).
 *
 * Invitation tokens are high-entropy random strings, so storing a SHA-256 digest (fast,
 * deterministic lookup) is appropriate. Passwords are owned by Clerk (ADR-0006) and never reach
 * this API. Raw tokens are returned once and never persisted.
 */

/** URL-safe random token of `bytes` entropy (default 256-bit). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Deterministic SHA-256 hex digest used to store/look up a token without keeping it raw. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Opaque identifier for a refresh-token rotation family (reuse detection). */
export function newFamilyId(): string {
  return randomUUID();
}
