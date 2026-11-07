import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRecord } from '../lib/view.js';

const testState = vi.hoisted(() => ({
  users: new Map<string, UserRecord & { clerkUserId: string | null }>(),
  profile: null as null | { email: string; name?: string },
  fetchProfile: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('../lib/clerk.js', () => ({
  getClerkProfileFetcher: () => testState.fetchProfile,
}));

vi.mock('../repositories/user.repo.js', () => ({
  findByClerkUserId: async (clerkUserId: string) =>
    [...testState.users.values()].find((user) => user.clerkUserId === clerkUserId) ?? null,
  findIdentityById: async (id: string) => {
    const user = testState.users.get(id);
    return user ? { id, clerkUserId: user.clerkUserId } : null;
  },
  createUser: async (data: { clerkUserId: string; email: string; name: string }) => {
    testState.createUser(data);
    if ([...testState.users.values()].some((user) => user.clerkUserId === data.clerkUserId)) {
      throw new Prisma.PrismaClientKnownRequestError('duplicate clerk id', {
        code: 'P2002',
        clientVersion: 'unit-test',
      });
    }
    if ([...testState.users.values()].some((user) => user.email === data.email)) {
      throw new Prisma.PrismaClientKnownRequestError('duplicate email', {
        code: 'P2002',
        clientVersion: 'unit-test',
      });
    }
    const user = makeUser(data.clerkUserId, data.email, data.name);
    testState.users.set(user.id, user);
    return user;
  },
  updateClerkProfile: async (id: string, data: { email: string; name?: string }) => {
    testState.updateUser(id, data);
    if ([...testState.users.values()].some((user) => user.id !== id && user.email === data.email)) {
      throw new Prisma.PrismaClientKnownRequestError('duplicate email', {
        code: 'P2002',
        clientVersion: 'unit-test',
      });
    }
    const user = testState.users.get(id)!;
    const updated = { ...user, ...data };
    testState.users.set(id, updated);
    return updated;
  },
}));

function makeUser(
  clerkUserId: string,
  email: string,
  name: string,
): UserRecord & { clerkUserId: string } {
  return {
    id: `cue_${clerkUserId}`,
    clerkUserId,
    name,
    email,
    avatarUrl: null,
    status: 'ACTIVE',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
  };
}

describe('Clerk identity provisioning and profile synchronization', () => {
  beforeEach(async () => {
    testState.users.clear();
    testState.fetchProfile.mockReset();
    testState.createUser.mockReset();
    testState.updateUser.mockReset();
    testState.profile = null;
    testState.fetchProfile.mockImplementation(async () => testState.profile);
    const { resetIdentityProfileCacheForTests } = await import('./identity.service.js');
    resetIdentityProfileCacheForTests();
  });

  it('provisions by Clerk ID and tolerates absent provider names without blanking identity data', async () => {
    testState.profile = { email: ' ADA@EXAMPLE.COM ' };
    const { resolveInternalIdentity } = await import('./identity.service.js');
    const user = await resolveInternalIdentity('user_ada');
    expect(user.email).toBe('ada@example.com');
    expect(user.name).toBe('ada@example.com');
  });

  it('adopts the unique winning profile when the same Clerk ID provisions concurrently', async () => {
    testState.profile = { email: 'race@example.com', name: 'Race' };
    const { resolveInternalIdentity } = await import('./identity.service.js');
    const [first, second] = await Promise.all([
      resolveInternalIdentity('user_race'),
      resolveInternalIdentity('user_race'),
    ]);
    expect(first.id).toBe(second.id);
    expect(
      [...testState.users.values()].filter((user) => user.clerkUserId === 'user_race'),
    ).toHaveLength(1);
  });

  it('rejects a new Clerk identity that collides with another account email without merging', async () => {
    const existing = makeUser('user_owner', 'owned@example.com', 'Owner');
    testState.users.set(existing.id, existing);
    testState.profile = { email: 'owned@example.com', name: 'Different person' };
    const { resolveInternalIdentity } = await import('./identity.service.js');
    await expect(resolveInternalIdentity('user_different')).rejects.toMatchObject({
      statusCode: 409,
      code: 'IDENTITY_EMAIL_CLASH',
    });
    expect(testState.users.get(existing.id)?.clerkUserId).toBe('user_owner');
  });

  it('synchronizes changed verified profile data and preserves the Clerk identity key', async () => {
    const initial = makeUser('user_max', 'old@example.com', 'Max');
    testState.users.set(initial.id, initial);
    testState.profile = { email: 'new@example.com', name: 'Max Updated' };
    const { resolveInternalIdentity } = await import('./identity.service.js');
    const result = await resolveInternalIdentity('user_max');
    expect(result).toMatchObject({
      id: initial.id,
      clerkUserId: 'user_max',
      email: 'new@example.com',
      name: 'Max Updated',
    });
    expect(testState.fetchProfile).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite a useful name when Clerk omits it', async () => {
    const initial = makeUser('user_name', 'old@example.com', 'Useful Name');
    testState.users.set(initial.id, initial);
    testState.profile = { email: 'new@example.com' };
    const { resolveInternalIdentity } = await import('./identity.service.js');
    const result = await resolveInternalIdentity('user_name');
    expect(result.name).toBe('Useful Name');
  });

  it('surfaces email collisions instead of merging different Clerk identities', async () => {
    const existing = makeUser('user_existing', 'claimed@example.com', 'Existing');
    const other = makeUser('user_other', 'other@example.com', 'Other');
    testState.users.set(existing.id, existing);
    testState.users.set(other.id, other);
    testState.profile = { email: 'claimed@example.com', name: 'Other' };
    const { refreshInternalIdentityProfile } = await import('./identity.service.js');
    await expect(refreshInternalIdentityProfile(other.id)).rejects.toMatchObject({
      statusCode: 409,
      code: 'IDENTITY_EMAIL_CLASH',
    });
    expect(testState.users.get(existing.id)?.clerkUserId).toBe('user_existing');
  });

  it('forces a fresh profile before invitation identity checks', async () => {
    const initial = makeUser('user_invitee', 'old@example.com', 'Invitee');
    testState.users.set(initial.id, initial);
    testState.profile = { email: 'new@example.com', name: 'Invitee' };
    const { refreshInternalIdentityProfile } = await import('./identity.service.js');
    await expect(refreshInternalIdentityProfile(initial.id)).resolves.toMatchObject({
      email: 'new@example.com',
    });
  });

  it('serializes concurrent profile refreshes for one Clerk identity', async () => {
    const initial = makeUser('user_parallel', 'old@example.com', 'Parallel');
    testState.users.set(initial.id, initial);
    let resolveProfile!: (profile: { email: string; name?: string }) => void;
    let profileStarted!: () => void;
    const started = new Promise<void>((resolve) => (profileStarted = resolve));
    testState.fetchProfile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveProfile = resolve;
          profileStarted();
        }),
    );
    const { resolveInternalIdentity, resetIdentityProfileCacheForTests } =
      await import('./identity.service.js');
    resetIdentityProfileCacheForTests();
    const a = resolveInternalIdentity('user_parallel');
    const b = resolveInternalIdentity('user_parallel');
    await started;
    resolveProfile({ email: 'fresh@example.com', name: 'Parallel' });
    const [first, second] = await Promise.all([a, b]);
    expect(first.email).toBe('fresh@example.com');
    expect(second.email).toBe('fresh@example.com');
    expect(testState.fetchProfile).toHaveBeenCalledTimes(1);
  });
});
