import { generateToken, hashToken, newFamilyId } from '../lib/crypto.js';
import { prisma } from '../lib/prisma.js';

/**
 * Session persistence for opaque, server-managed sessions (ADR-0003). Only SHA-256 hashes of the
 * access/refresh tokens are stored; the raw pair is generated here and returned once to the caller
 * (the auth service → the trusted desktop main process, never the renderer). `familyId` groups a
 * refresh-token rotation lineage so a reused/stolen refresh token can revoke the whole family.
 */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface IssuedSessionRow {
  tokens: TokenPair;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

export interface SessionSummary {
  id: string;
  userId: string;
  familyId: string;
  revokedAt: Date | null;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

/** Session + minimal user status, resolved by the `authenticate` middleware from the access hash. */
export interface SessionWithUserStatus {
  id: string;
  userId: string;
  familyId: string;
  revokedAt: Date | null;
  accessExpiresAt: Date;
  user: { status: 'ACTIVE' | 'DISABLED' };
}

const sessionSummarySelect = {
  id: true,
  userId: true,
  familyId: true,
  revokedAt: true,
  accessExpiresAt: true,
  refreshExpiresAt: true,
} as const;

/** Create a brand-new rotation family (login / register). */
export async function createSession(
  userId: string,
  accessTtlSeconds: number,
  refreshTtlSeconds: number,
  meta?: { userAgent?: string; ip?: string },
): Promise<IssuedSessionRow> {
  return createSessionInFamily(userId, newFamilyId(), accessTtlSeconds, refreshTtlSeconds, meta);
}

/** Create a session within an existing family (refresh rotation). */
export async function createSessionInFamily(
  userId: string,
  familyId: string,
  accessTtlSeconds: number,
  refreshTtlSeconds: number,
  meta?: { userAgent?: string; ip?: string },
): Promise<IssuedSessionRow> {
  const tokens: TokenPair = { accessToken: generateToken(), refreshToken: generateToken() };
  const now = Date.now();
  const accessExpiresAt = new Date(now + accessTtlSeconds * 1000);
  const refreshExpiresAt = new Date(now + refreshTtlSeconds * 1000);

  await prisma.session.create({
    data: {
      userId,
      familyId,
      accessTokenHash: hashToken(tokens.accessToken),
      refreshTokenHash: hashToken(tokens.refreshToken),
      accessExpiresAt,
      refreshExpiresAt,
      userAgent: meta?.userAgent ?? null,
      ip: meta?.ip ?? null,
    },
  });

  return { tokens, accessExpiresAt, refreshExpiresAt };
}

export async function findSessionByAccessHash(
  accessToken: string,
): Promise<SessionWithUserStatus | null> {
  return prisma.session.findUnique({
    where: { accessTokenHash: hashToken(accessToken) },
    select: {
      id: true,
      userId: true,
      familyId: true,
      revokedAt: true,
      accessExpiresAt: true,
      user: { select: { status: true } },
    },
  });
}

export async function findSessionByRefreshHash(
  refreshToken: string,
): Promise<SessionSummary | null> {
  return prisma.session.findUnique({
    where: { refreshTokenHash: hashToken(refreshToken) },
    select: sessionSummarySelect,
  });
}

/** Resolve a session by its internal id (used to find the family to preserve on password change). */
export async function findSessionById(id: string): Promise<SessionSummary | null> {
  return prisma.session.findUnique({ where: { id }, select: sessionSummarySelect });
}

/** Revoke a single session (used when rotating: the presented refresh token is retired). */
export async function revokeSessionById(id: string): Promise<void> {
  await prisma.session.update({ where: { id }, data: { revokedAt: new Date() } });
}

/**
 * Revoke a whole rotation family. Used on explicit logout (kill every device in the family)
 * and on refresh-token reuse detection (a stolen token ⇒ invalidate the entire lineage).
 */
export async function revokeFamily(familyId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Revoke every live session for a user EXCEPT the given family. Used on password change to sign
 * the account out on all other devices while keeping the acting session's lineage alive.
 */
export async function revokeExceptFamily(userId: string, keepFamilyId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, familyId: { not: keepFamilyId }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Housekeeping: drop long-expired sessions. Not wired to a cron in Phase 2; available for tests/ops. */
export async function deleteExpired(before: Date): Promise<number> {
  const res = await prisma.session.deleteMany({ where: { refreshExpiresAt: { lt: before } } });
  return res.count;
}
