import type { AuthSessionView, IssuedSession } from '@buildtogether/shared';
import { conflict, unauthorized } from '../errors/app-error.js';
import { env } from '../lib/env.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import * as sessionRepo from '../repositories/session.repo.js';
import * as userRepo from '../repositories/user.repo.js';
import * as workspaceRepo from '../repositories/workspace.repo.js';
import { buildSessionView } from '../lib/view.js';

/**
 * Authentication business logic (ADR-0003). Owns password hashing, opaque session issuance with
 * refresh-token rotation + family reuse-detection, and the generic, information-safe errors the
 * client sees. It never touches HTTP and never returns a password hash or an internal reason that
 * would let an attacker enumerate accounts.
 */

/** Non-secret request context captured for a session row (device binding / forensics). */
export interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

/** A single, deliberately vague credential failure — identical for unknown email OR bad password,
 *  and constant-time (we hash even when the user is unknown, to blunt timing/enumeration). */
const CREDENTIAL_ERROR = 'Incorrect email or password';

export async function register(
  input: { name: string; email: string; password: string },
  meta: RequestMeta,
): Promise<IssuedSession> {
  if (await userRepo.existsByEmail(input.email)) {
    // 409 on a known-duplicate during explicit registration is fine — this is a create form, not a
    // login, so disclosing "already taken" aids the user, not an enumerator on the login path.
    throw conflict('EMAIL_TAKEN', 'That email is already registered');
  }

  const passwordHash = await hashPassword(input.password);
  const created = await userRepo.createUser({ name: input.name, email: input.email, passwordHash });
  const session = await issueSession(created.id, meta);
  return session;
}

export async function login(
  input: { email: string; password: string },
  meta: RequestMeta,
): Promise<IssuedSession> {
  const record = await userRepo.findByEmailWithSecret(input.email);
  // Always run a verify to keep timing similar whether or not the account exists.
  const okPwd = await verifyPassword(record?.passwordHash ?? DUMMY_HASH, input.password);
  if (!record || !okPwd) throw unauthorized('INVALID_CREDENTIALS', CREDENTIAL_ERROR);
  if (record.status !== 'ACTIVE')
    throw unauthorized('ACCOUNT_DISABLED', 'This account is disabled');

  return issueSession(record.id, meta);
}

/** Resolve the current session view for an authenticated user (tokens are NOT re-issued here). */
export async function currentSession(userId: string): Promise<AuthSessionView> {
  const user = await userRepo.findUserById(userId);
  if (!user) throw unauthorized('INVALID_SESSION', 'Session is no longer valid');
  const memberships = await workspaceRepo.listMembershipsForUser(userId);
  return buildSessionView(user, memberships);
}

/** Explicit sign-out: revoke the entire rotation family behind the presented refresh token. */
export async function logout(refreshToken: string): Promise<void> {
  const session = await sessionRepo.findSessionByRefreshHash(refreshToken);
  if (session) await sessionRepo.revokeFamily(session.familyId);
  // Logging out with an unknown/already-revoked token is a no-op success (idempotent).
}

/**
 * Rotate a refresh token for a new access/refresh pair. Detects reuse of an already-rotated token
 * (a hallmark of theft) and, when found, revokes the whole family to lock out both parties until a
 * fresh login. This is why a stolen refresh token can't be quietly replayed.
 */
export async function refresh(refreshToken: string, meta: RequestMeta): Promise<IssuedSession> {
  const session = await sessionRepo.findSessionByRefreshHash(refreshToken);
  if (!session) throw unauthorized('INVALID_REFRESH_TOKEN', 'Refresh token is invalid');

  // Reuse detection: the presented token was already rotated away or revoked → compromise.
  if (session.revokedAt !== null) {
    await sessionRepo.revokeFamily(session.familyId);
    throw unauthorized('REFRESH_REUSE_DETECTED', 'Session reuse detected, please sign in again');
  }
  if (session.refreshExpiresAt.getTime() <= Date.now()) {
    throw unauthorized('REFRESH_EXPIRED', 'Session has expired, please sign in again');
  }

  // Rotate: retire the presented session and mint a successor in the same family.
  await sessionRepo.revokeSessionById(session.id);
  const issued = await sessionRepo.createSessionInFamily(
    session.userId,
    session.familyId,
    env.accessTokenTtlSeconds,
    env.refreshTokenTtlSeconds,
    meta,
  );
  const view = await currentSession(session.userId);
  return toIssued(issued, view);
}

/**
 * Change password for a verified identity. Revokes every OTHER device's session family, then
 * rotates the acting session (retires the current one, issues a successor in a NEW family) so the
 * user stays signed in here with fresh tokens while all other logins are invalidated.
 */
export async function changePassword(
  userId: string,
  currentSessionId: string,
  input: { currentPassword: string; newPassword: string },
  meta: RequestMeta,
): Promise<IssuedSession> {
  const record = await userRepo.findSecretById(userId);
  if (!record || !(await verifyPassword(record.passwordHash, input.currentPassword))) {
    throw unauthorized('INVALID_CREDENTIALS', 'Current password is incorrect');
  }

  const passwordHash = await hashPassword(input.newPassword);
  await userRepo.updatePasswordHash(userId, passwordHash);

  // Retire the acting session and sign the account out on every other device.
  const current = await sessionRepo.findSessionById(currentSessionId);
  if (current) await sessionRepo.revokeSessionById(current.id);
  await sessionRepo.revokeExceptFamily(userId, current?.familyId ?? '__none__');

  // Issue a brand-new family for this device so its session survives the fleet-wide revoke.
  const issued = await sessionRepo.createSession(
    userId,
    env.accessTokenTtlSeconds,
    env.refreshTokenTtlSeconds,
    meta,
  );
  const view = await currentSession(userId);
  return toIssued(issued, view);
}

// ---- internal helpers ----

async function issueSession(userId: string, meta: RequestMeta): Promise<IssuedSession> {
  const issued = await sessionRepo.createSession(
    userId,
    env.accessTokenTtlSeconds,
    env.refreshTokenTtlSeconds,
    meta,
  );
  const view = await currentSession(userId);
  return toIssued(issued, view);
}

function toIssued(
  row: { tokens: sessionRepo.TokenPair; accessExpiresAt: Date; refreshExpiresAt: Date },
  session: AuthSessionView,
): IssuedSession {
  return {
    tokens: {
      accessToken: row.tokens.accessToken,
      refreshToken: row.tokens.refreshToken,
      accessExpiresAt: row.accessExpiresAt.toISOString(),
      refreshExpiresAt: row.refreshExpiresAt.toISOString(),
    },
    session,
  };
}

// A constant, valid Argon2id-shaped hash used to equalize timing when the account is unknown.
// (Not a real password's hash; verify against it simply returns false.)
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$K9Vt0c0H0mY3m3m3m3m3m3m3m3m3m3m3m3m3m3m3m3m';
