import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { AuthSessionView, IssuedSession } from '@buildtogether/shared';
import { prisma } from '../lib/prisma.js';
import { PASSWORD, resetDb, TestApi } from '../test/harness.js';

/**
 * End-to-end auth tests over the real HTTP API + migrated PostgreSQL (ADR-0003): registration
 * validation, Argon2id hashing, login (no account enumeration), opaque-session authentication,
 * refresh-token rotation with family reuse-detection, and password change.
 */

const PW = PASSWORD; // 26 chars, passes the ≥10 policy
const NEW_PW = 'N3w-Str0ng-Passphrase-Changed!';

// hashToken mirror (SHA-256 hex) so we can target a session row by its stored access hash.
const sha = (t: string): string => createHash('sha256').update(t).digest('hex');

describe('auth', () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await TestApi.start();
  });
  afterAll(async () => {
    await api?.stop();
  });
  beforeEach(async () => {
    await resetDb();
  });

  it('registers a user and returns a token pair + session (no password hash on the wire)', async () => {
    const res = await api.post<IssuedSession>('/api/v1/auth/register', {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: PW,
    });
    expect(res.status).toBe(201);
    const data = res.body.data!;
    expect(data.tokens.accessToken).toBeTruthy();
    expect(data.tokens.refreshToken).toBeTruthy();
    expect(data.session.user.email).toBe('ada@example.com');
    expect(data.session.workspaces).toEqual([]);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/i);
  });

  it('normalizes email (trim + lowercase)', async () => {
    const issued = await api.registerAs('Grace Hopper', '  GRACE@Example.COM  ', PW);
    expect(issued.session.user.email).toBe('grace@example.com');
    const row = await prisma.user.findUnique({ where: { email: 'grace@example.com' } });
    expect(row).not.toBeNull();
  });

  it('stores the password as an Argon2id hash', async () => {
    await api.registerAs('Hasher', 'hash@example.com', PW);
    const row = await prisma.user.findUnique({ where: { email: 'hash@example.com' } });
    expect(row!.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(row!.passwordHash).not.toContain(PW);
  });

  it('rejects a duplicate email with 409', async () => {
    await api.registerAs('First', 'dup@example.com', PW);
    const res = await api.post('/api/v1/auth/register', {
      name: 'Second',
      email: 'dup@example.com',
      password: PW,
    });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('EMAIL_TAKEN');
  });

  it('rejects an invalid email with 400 + field details', async () => {
    const res = await api.post('/api/v1/auth/register', {
      name: 'Bad',
      email: 'not-an-email',
      password: PW,
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_FAILED');
    expect(res.body.error?.details?.email?.length).toBeGreaterThan(0);
  });

  it('rejects a weak (too-short) password with 400', async () => {
    const res = await api.post('/api/v1/auth/register', {
      name: 'Short',
      email: 'short@example.com',
      password: 'tiny',
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.details?.password?.length).toBeGreaterThan(0);
  });

  it('logs in with correct credentials', async () => {
    await api.registerAs('Login User', 'login@example.com', PW);
    const res = await api.post<IssuedSession>('/api/v1/auth/login', {
      email: 'login@example.com',
      password: PW,
    });
    expect(res.status).toBe(201);
    expect(res.body.data!.tokens.accessToken).toBeTruthy();
  });

  it('does not leak whether an email exists (identical generic failure)', async () => {
    await api.registerAs('Exists', 'exists@example.com', PW);
    const wrongPw = await api.post('/api/v1/auth/login', {
      email: 'exists@example.com',
      password: 'wrong-password-xyz',
    });
    const noSuch = await api.post('/api/v1/auth/login', {
      email: 'ghost@example.com',
      password: 'wrong-password-xyz',
    });
    expect(wrongPw.status).toBe(401);
    expect(noSuch.status).toBe(401);
    expect(noSuch.body.error).toEqual(wrongPw.body.error);
    expect(wrongPw.body.error?.message).toMatch(/incorrect email or password/i);
  });

  it('rejects a disabled account at login', async () => {
    await api.registerAs('Banned', 'banned@example.com', PW);
    await prisma.user.update({
      where: { email: 'banned@example.com' },
      data: { status: 'DISABLED' },
    });
    const res = await api.post('/api/v1/auth/login', { email: 'banned@example.com', password: PW });
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('ACCOUNT_DISABLED');
  });

  it('authenticates /me with a bearer token and rejects without one', async () => {
    const { tokens, session } = await api.registerAs('Ada', 'ada@example.com', PW);
    const okRes = await api.get<AuthSessionView>('/api/v1/auth/me', tokens.accessToken);
    expect(okRes.status).toBe(200);
    expect(okRes.body.data!.user.email).toBe(session.user.email);

    const anon = await api.get('/api/v1/auth/me');
    expect(anon.status).toBe(401);
    expect(anon.body.error?.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a garbage bearer token', async () => {
    const res = await api.get('/api/v1/auth/me', 'not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('INVALID_SESSION');
  });

  it('revokes the session on logout (access token stops working)', async () => {
    const { tokens } = await api.registerAs('Out', 'out@example.com', PW);
    const out = await api.post(
      '/api/v1/auth/logout',
      { refreshToken: tokens.refreshToken },
      tokens.accessToken,
    );
    expect(out.status).toBe(200);
    const after = await api.get('/api/v1/auth/me', tokens.accessToken);
    expect(after.status).toBe(401);
    expect(after.body.error?.code).toBe('INVALID_SESSION');
  });

  it('rejects an expired access token', async () => {
    const { tokens } = await api.registerAs('Exp', 'exp@example.com', PW);
    await prisma.session.update({
      where: { accessTokenHash: sha(tokens.accessToken) },
      data: { accessExpiresAt: new Date(Date.now() - 1000) },
    });
    const res = await api.get('/api/v1/auth/me', tokens.accessToken);
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('SESSION_EXPIRED');
  });

  it('rotates refresh tokens and detects reuse by revoking the whole family', async () => {
    const { tokens } = await api.registerAs('Rot', 'rot@example.com', PW);

    const first = await api.post<IssuedSession>('/api/v1/auth/refresh', {
      refreshToken: tokens.refreshToken,
    });
    expect(first.status).toBe(200);
    const rotated = first.body.data!;
    expect(rotated.tokens.refreshToken).not.toBe(tokens.refreshToken);

    // The successor access token works.
    const me = await api.get('/api/v1/auth/me', rotated.tokens.accessToken);
    expect(me.status).toBe(200);

    // Replaying the OLD (already-rotated) refresh token signals theft → family revoked.
    const reuse = await api.post('/api/v1/auth/refresh', { refreshToken: tokens.refreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error?.code).toBe('REFRESH_REUSE_DETECTED');

    // After reuse detection the successor is revoked too.
    const afterMe = await api.get('/api/v1/auth/me', rotated.tokens.accessToken);
    expect(afterMe.status).toBe(401);
  });

  it('changes the password, keeps this device, and invalidates other sessions', async () => {
    const a = await api.registerAs('Rotate', 'rotate@example.com', PW);
    // A second, independent login (different family) representing "another device".
    const b = await api.post<IssuedSession>('/api/v1/auth/login', {
      email: 'rotate@example.com',
      password: PW,
    });
    const otherAccess = b.body.data!.tokens.accessToken;

    const changed = await api.post<IssuedSession>(
      '/api/v1/auth/change-password',
      { currentPassword: PW, newPassword: NEW_PW },
      a.tokens.accessToken,
    );
    expect(changed.status).toBe(200);
    // The acting device stays signed in with rotated tokens.
    const meStill = await api.get('/api/v1/auth/me', changed.body.data!.tokens.accessToken);
    expect(meStill.status).toBe(200);
    // The other device is logged out.
    const other = await api.get('/api/v1/auth/me', otherAccess);
    expect(other.status).toBe(401);
    // New password logs in; old does not.
    const loginNew = await api.post('/api/v1/auth/login', {
      email: 'rotate@example.com',
      password: NEW_PW,
    });
    expect(loginNew.status).toBe(201);
    const loginOld = await api.post('/api/v1/auth/login', {
      email: 'rotate@example.com',
      password: PW,
    });
    expect(loginOld.status).toBe(401);
  });

  it('rejects a password change with a wrong current password', async () => {
    const a = await api.registerAs('Wrong', 'wrongcur@example.com', PW);
    const res = await api.post(
      '/api/v1/auth/change-password',
      { currentPassword: 'not-the-current-password', newPassword: 'Another-Str0ng-Pw!!' },
      a.tokens.accessToken,
    );
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects a new password that equals the current one', async () => {
    const a = await api.registerAs('Same', 'samepw@example.com', PW);
    const res = await api.post(
      '/api/v1/auth/change-password',
      { currentPassword: PW, newPassword: PW },
      a.tokens.accessToken,
    );
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_FAILED');
  });

  it('logs out idempotently with just a refresh token (no access token needed)', async () => {
    const { tokens } = await api.registerAs('Idem', 'idem@example.com', PW);
    const res = await api.post('/api/v1/auth/logout', { refreshToken: tokens.refreshToken });
    expect(res.status).toBe(200);
  });
});
