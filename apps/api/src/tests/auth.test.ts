import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuthSessionView } from '@buildtogether/shared';
import { prisma } from '../lib/prisma.js';
import { resolveInternalIdentity } from '../services/identity.service.js';
import { mintClerkToken, resetClerkFixtures } from '../test/clerk-fixtures.js';
import { resetDb, TestApi } from '../test/harness.js';

/**
 * Clerk identity tests over the real HTTP API + migrated PostgreSQL (ADR-0006). Clerk owns
 * credentials, so these verify the API's trust boundary instead: a VERIFIED Clerk `sub` maps onto a
 * stable internal identity (provisioned on first login, reused thereafter), email is never a merge
 * key, and unverified/absent tokens fail closed. Tests use the injected fake Clerk seams and never
 * fabricate a real Clerk JWT.
 */

describe('clerk identity', () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await TestApi.start();
  });
  afterAll(async () => {
    await api?.stop();
  });
  beforeEach(async () => {
    await resetDb();
    resetClerkFixtures();
  });

  it('provisions a new internal user on the first valid Clerk token and returns the session view', async () => {
    const token = mintClerkToken({
      clerkUserId: 'user_new_1',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
    });
    const res = await api.get<AuthSessionView>('/api/v1/auth/me', token);
    expect(res.status).toBe(200);
    expect(res.body.data!.user.email).toBe('ada@example.com');
    expect(res.body.data!.user.name).toBe('Ada Lovelace');
    expect(res.body.data!.workspaces).toEqual([]);
    const row = await prisma.user.findUnique({ where: { clerkUserId: 'user_new_1' } });
    expect(row).not.toBeNull();
    expect(row!.passwordHash).toBeNull(); // Clerk-provisioned users have no local password
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/i);
  });

  it('reuses the SAME internal user for a later token with the same Clerk id (no duplicate)', async () => {
    const t1 = mintClerkToken({
      clerkUserId: 'user_stable',
      email: 'sam@example.com',
      name: 'Sam',
    });
    await api.get('/api/v1/auth/me', t1);
    const afterFirst = await prisma.user.count({ where: { clerkUserId: 'user_stable' } });
    // A fresh session token (Clerk issues many) for the same identity must not create a second row.
    const t2 = mintClerkToken({
      clerkUserId: 'user_stable',
      email: 'sam@example.com',
      name: 'Sam',
    });
    const me = await api.get<AuthSessionView>('/api/v1/auth/me', t2);
    expect(me.status).toBe(200);
    const afterSecond = await prisma.user.count({ where: { clerkUserId: 'user_stable' } });
    expect(afterFirst).toBe(1);
    expect(afterSecond).toBe(1);
  });

  it('keys identity on the Clerk id, not email: a Clerk email change never spawns a duplicate', async () => {
    const t1 = mintClerkToken({
      clerkUserId: 'user_emailmove',
      email: 'old@example.com',
      name: 'Max',
    });
    await api.get('/api/v1/auth/me', t1);
    // Same Clerk id, email now changed upstream. The internal id stays the anchor; no new user.
    const t2 = mintClerkToken({
      clerkUserId: 'user_emailmove',
      email: 'new@example.com',
      name: 'Max',
    });
    const me = await api.get<AuthSessionView>('/api/v1/auth/me', t2);
    expect(me.status).toBe(200);
    expect(me.body.data!.user.email).toBe('old@example.com'); // resolved by clerkUserId, not re-keyed by email
    expect(await prisma.user.count({ where: { clerkUserId: 'user_emailmove' } })).toBe(1);
  });

  it('rejects a request with no bearer token', async () => {
    const res = await api.get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a garbage/unverified bearer token (fails closed)', async () => {
    const res = await api.get('/api/v1/auth/me', 'not-a-real-clerk-token');
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('INVALID_SESSION');
  });

  it('rejects a disabled internal account even with a valid Clerk session', async () => {
    const token = mintClerkToken({
      clerkUserId: 'user_banned',
      email: 'banned@example.com',
      name: 'B',
    });
    await api.get('/api/v1/auth/me', token);
    await prisma.user.update({
      where: { clerkUserId: 'user_banned' },
      data: { status: 'DISABLED' },
    });
    const res = await api.get('/api/v1/auth/me', token);
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('ACCOUNT_DISABLED');
  });

  it('never auto-links by email: provisioning that collides with a legacy account is a conflict', async () => {
    // A legacy self-managed user exists with no Clerk id.
    const legacy = await prisma.user.create({
      data: { name: 'Legacy', email: 'clash@example.com', passwordHash: '$argon2id$legacy' },
      select: { id: true, clerkUserId: true },
    });
    expect(legacy.clerkUserId).toBeNull();
    // A DIFFERENT Clerk identity claims the same email — we must NOT merge it onto the legacy row.
    const token = mintClerkToken({
      clerkUserId: 'user_clerk_other',
      email: 'clash@example.com',
      name: 'Imposter',
    });
    const res = await api.get('/api/v1/auth/me', token);
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('IDENTITY_EMAIL_CLASH');
    // The legacy account is untouched (still no clerkUserId) and no new user was created.
    const stillLegacy = await prisma.user.findUnique({ where: { id: legacy.id } });
    expect(stillLegacy!.clerkUserId).toBeNull();
    expect(await prisma.user.count({ where: { clerkUserId: 'user_clerk_other' } })).toBe(0);
    expect(await prisma.user.count()).toBe(1);
  });

  it('adopts the winning row on a concurrent first login of the same Clerk id (unique-safe)', async () => {
    mintClerkToken({ clerkUserId: 'user_race', email: 'race@example.com', name: 'Race' });
    // Fire two provisions concurrently; the unique constraint must yield exactly one internal user.
    const [a, b] = await Promise.all([
      resolveInternalIdentity('user_race'),
      resolveInternalIdentity('user_race'),
    ]);
    expect(a.id).toBe(b.id);
    expect(await prisma.user.count({ where: { clerkUserId: 'user_race' } })).toBe(1);
  });
});
