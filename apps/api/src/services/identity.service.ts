import { Prisma } from '@prisma/client';
import { AppError, conflict, notFound, unauthorized } from '../errors/app-error.js';
import { getClerkProfileFetcher } from '../lib/clerk.js';
import type { UserRecord } from '../lib/view.js';
import * as userRepo from '../repositories/user.repo.js';

const PROFILE_SYNC_TTL_MS = 5 * 60 * 1000;
const profileSyncedAt = new Map<string, number>();
const profileLocks = new Map<string, Promise<void>>();

/** Resolve (or provision) the ACTIVE internal user for a verified Clerk session. */
export async function resolveInternalIdentity(clerkUserId: string): Promise<UserRecord> {
  const existing = await userRepo.findByClerkUserId(clerkUserId);
  if (!existing) return provisionIdentity(clerkUserId);
  const active = assertActive(existing);

  // Avoid a Clerk Backend API call on every resource request. A process-local TTL refreshes
  // profile data periodically; invitation acceptance separately forces a fresh provider read.
  if (Date.now() - (profileSyncedAt.get(clerkUserId) ?? 0) >= PROFILE_SYNC_TTL_MS) {
    try {
      return assertActive(await synchronizeProfile(clerkUserId, active, false));
    } catch (error) {
      // A changed email owned by another Cue identity needs explicit resolution. Temporary Clerk
      // outages or a removed verified email do not take an existing account offline; sensitive
      // invite acceptance performs a strict, uncached refresh before authorizing the action.
      if (error instanceof AppError && error.code === 'IDENTITY_EMAIL_CLASH') throw error;
      return active;
    }
  }
  return active;
}

/** Force a fresh verified Clerk profile before applying email-bound invitation authorization. */
export async function refreshInternalIdentityProfile(userId: string): Promise<UserRecord> {
  const identity = await userRepo.findIdentityById(userId);
  if (!identity) throw notFound('USER_NOT_FOUND', 'User not found');
  if (!identity.clerkUserId) {
    throw unauthorized('CLERK_IDENTITY_REQUIRED', 'A current Clerk identity is required');
  }
  const existing = await userRepo.findByClerkUserId(identity.clerkUserId);
  if (!existing) throw unauthorized('UNKNOWN_IDENTITY', 'Clerk identity could not be resolved');
  return assertActive(await synchronizeProfile(identity.clerkUserId, existing, true));
}

async function provisionIdentity(clerkUserId: string): Promise<UserRecord> {
  const profile = await getClerkProfileFetcher()(clerkUserId);
  const email = profile.email?.trim().toLowerCase();
  if (!email) {
    throw unauthorized('NO_VERIFIED_EMAIL', 'A verified email address is required to use Cue');
  }
  try {
    const created = await userRepo.createUser({
      name: profile.name?.trim() || email,
      email,
      clerkUserId,
    });
    profileSyncedAt.set(clerkUserId, Date.now());
    return created;
  } catch (err) {
    if (isUniqueViolation(err)) {
      // A concurrent request provisioned THIS Clerk id first → adopt the committed row.
      const raced = await userRepo.findByClerkUserId(clerkUserId);
      if (raced) return assertActive(raced);
      // The clash is on `email`: a different account already owns it. Never merge by email.
      throw conflict(
        'IDENTITY_EMAIL_CLASH',
        'An account already exists for this email; linking must be done explicitly',
      );
    }
    throw err;
  }
}

async function synchronizeProfile(
  clerkUserId: string,
  fallback: UserRecord,
  force: boolean,
): Promise<UserRecord> {
  const prior = profileLocks.get(clerkUserId) ?? Promise.resolve();
  let result: UserRecord = fallback;
  const operation = prior.then(async () => {
    if (!force && Date.now() - (profileSyncedAt.get(clerkUserId) ?? 0) < PROFILE_SYNC_TTL_MS) {
      result = (await userRepo.findByClerkUserId(clerkUserId)) ?? fallback;
      return;
    }

    const profile = await getClerkProfileFetcher()(clerkUserId);
    const email = profile.email?.trim().toLowerCase();
    if (!email) {
      throw unauthorized('NO_VERIFIED_EMAIL', 'A verified email address is required to use Cue');
    }
    const update: { email: string; name?: string } = { email };
    if (profile.name?.trim()) update.name = profile.name.trim();
    try {
      result = await userRepo.updateClerkProfile(fallback.id, update);
      profileSyncedAt.set(clerkUserId, Date.now());
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw conflict(
          'IDENTITY_EMAIL_CLASH',
          'An account already exists for this email; linking must be done explicitly',
        );
      }
      throw error;
    }
  });

  const settled = operation.then(
    () => undefined,
    () => undefined,
  );
  profileLocks.set(clerkUserId, settled);
  try {
    await operation;
    return result;
  } finally {
    if (profileLocks.get(clerkUserId) === settled) profileLocks.delete(clerkUserId);
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

/** Explicit reset seam for isolated unit tests; not called by application code. */
export function resetIdentityProfileCacheForTests(): void {
  profileSyncedAt.clear();
  profileLocks.clear();
}
