import { prisma } from '../lib/prisma.js';
import type { UserRecord } from '../lib/view.js';

/**
 * User persistence. The ONLY layer touching Prisma for the `User` table (backend-engineering
 * layering). Returns wire-safe records that already exclude `passwordHash`; the password hash is
 * fetched by exactly one method (`findByEmailWithSecret`) needed at login, and never leaves the
 * service. Email is assumed pre-normalized by the validation edge.
 */

/** Select that yields a `UserRecord` (no secret). Reused to keep projection consistent. */
const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  status: true,
  createdAt: true,
} as const;

export interface NewUser {
  name: string;
  email: string;
  /** Clerk's stable user id (ADR-0006). Required for Clerk-provisioned identities. */
  clerkUserId?: string;
  /** Legacy self-managed accounts only; Clerk-provisioned users have no local password. */
  passwordHash?: string | null;
}

export async function createUser(data: NewUser): Promise<UserRecord> {
  return prisma.user.create({ data, select: publicUserSelect });
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({ where: { id }, select: publicUserSelect });
}

/**
 * Identity mapping (ADR-0006): resolve the internal user from Clerk's stable `sub` claim. This —
 * never email — is the lookup used on every authenticated request. Returns the record plus the
 * `status` the middleware needs to reject a disabled account.
 */
export async function findByClerkUserId(clerkUserId: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({ where: { clerkUserId }, select: publicUserSelect });
}

export async function findIdentityById(
  id: string,
): Promise<{ id: string; clerkUserId: string | null } | null> {
  return prisma.user.findUnique({ where: { id }, select: { id: true, clerkUserId: true } });
}

/** Update only provider fields that were actually supplied; Prisma's unique email index remains authoritative. */
export async function updateClerkProfile(
  id: string,
  data: { email: string; name?: string },
): Promise<UserRecord> {
  return prisma.user.update({ where: { id }, data, select: publicUserSelect });
}

/** Login only: includes the Argon2id hash. Callers must never return this to a client. */
export async function findByEmailWithSecret(
  email: string,
): Promise<{ id: string; passwordHash: string | null; status: 'ACTIVE' | 'DISABLED' } | null> {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, status: true },
  });
}

/** Password-change only: resolve the secret + status directly by id (avoids an extra hop). */
export async function findSecretById(
  id: string,
): Promise<{ passwordHash: string | null; status: 'ACTIVE' | 'DISABLED' } | null> {
  return prisma.user.findUnique({ where: { id }, select: { passwordHash: true, status: true } });
}

/** Result of a profile update, shaped for the service to re-read the public view. */
export async function updateUser(
  id: string,
  data: { name?: string; avatarUrl?: string | null },
): Promise<void> {
  await prisma.user.update({ where: { id }, data });
}

export async function updatePasswordHash(id: string, passwordHash: string): Promise<void> {
  await prisma.user.update({ where: { id }, data: { passwordHash } });
}

/** Whether an email is already registered — used for the duplicate check at registration. */
export async function existsByEmail(email: string): Promise<boolean> {
  const count = await prisma.user.count({ where: { email } });
  return count > 0;
}
