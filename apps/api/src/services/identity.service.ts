import { Prisma } from '@prisma/client';
import { conflict, unauthorized } from '../errors/app-error.js';
import { getClerkProfileFetcher } from '../lib/clerk.js';
import type { UserRecord } from '../lib/view.js';
import * as userRepo from '../repositories/user.repo.js';

/**
 * Internal identity resolution (ADR-0006). Clerk authenticates; this service maps a VERIFIED Clerk
 * user id (`sub`) onto Cue's internal identity and owns provisioning. The stable Clerk id — never
 * email — is the key. Rules enforced here, per the migration brief:
 *
 *  - A returning identity is resolved by `clerkUserId` (indexed unique) — the same internal user,
 *    with all its memberships and roles, is reused.
 *  - A first-time Clerk id is provisioned with the verified email + name read from the Clerk
 *    Backend API. Concurrent first logins are made safe by the unique constraint on `clerkUserId`:
 *    a losing insert re-reads and adopts the winner.
 *  - We NEVER auto-link or merge by email. If provisioning collides on an email that already
 *    belongs to a DIFFERENT account (e.g. a legacy self-managed user), that is surfaced as a
 *    conflict for explicit, manual resolution — never silently bound to the new Clerk identity.
 */

/** Resolve (or provision) the ACTIVE internal user for a verified Clerk session. */
export async function resolveInternalIdentity(clerkUserId: string): Promise<UserRecord> {
  const existing = await userRepo.findByClerkUserId(clerkUserId);
  if (existing) return assertActive(existing);
  return provisionIdentity(clerkUserId);
}

async function provisionIdentity(clerkUserId: string): Promise<UserRecord> {
  // Reads the verified email + name from Clerk; fails closed (401) when unavailable/unconfigured.
  const profile = await getClerkProfileFetcher()(clerkUserId);
  try {
    const created = await userRepo.createUser({
      name: profile.name,
      email: profile.email,
      clerkUserId,
    });
    return created;
  } catch (err) {
    if (isUniqueViolation(err)) {
      // A concurrent request provisioned THIS Clerk id first → adopt the committed row.
      const raced = await userRepo.findByClerkUserId(clerkUserId);
      if (raced) return assertActive(raced);
      // The clash is on `email`: a different account already owns it. Do not merge.
      throw conflict(
        'IDENTITY_EMAIL_CLASH',
        'An account already exists for this email; linking must be done explicitly',
      );
    }
    throw err;
  }
}

function assertActive(user: UserRecord): UserRecord {
  if (user.status !== 'ACTIVE') {
    throw unauthorized('ACCOUNT_DISABLED', 'Account is disabled');
  }
  return user;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
