import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { makeAuthLimiter } from '../middlewares/rate-limit.js';
import { errorHandler } from '../middlewares/error-handler.js';
import { requestLog } from '../middlewares/request-log.js';
import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { mintClerkToken, resetClerkFixtures } from '../test/clerk-fixtures.js';
import { resetDb, TestApi } from '../test/harness.js';

/**
 * Security-focused checks (brief §13): brute-force throttling, error hygiene (no internal leakage),
 * safe ORM parameterization (SQL-injection), and password hashing correctness.
 */
describe('security', () => {
  it('throttles repeated failed auth attempts (brute-force protection)', async () => {
    // A tiny isolated app with a low limit so we don't depend on the raised test-suite ceiling.
    const app = express();
    app.set('trust proxy', 1);
    app.use(requestLog);
    app.post('/probe', makeAuthLimiter(3), (_req, res) => res.status(401).json({ ok: true }));
    app.use(errorHandler);

    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    try {
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) {
        const res = await fetch(`${base}/probe`, { method: 'POST' });
        codes.push(res.status);
      }
      // First 3 fail-attempts allowed (each counts), then the 4th/5th are rate-limited.
      expect(codes.slice(0, 3)).toEqual([401, 401, 401]);
      expect(codes[3]).toBe(429);
      const limited = await fetch(`${base}/probe`, { method: 'POST' });
      expect(limited.status).toBe(429);
      const body = (await limited.json()) as { error?: { code?: string } };
      expect(body.error?.code).toBe('RATE_LIMITED');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('produces distinct, non-deterministic Argon2id hashes that verify correctly', async () => {
    const pw = 'Correct-Horse-Battery-Staple';
    const [h1, h2] = [await hashPassword(pw), await hashPassword(pw)];
    expect(h1.startsWith('$argon2id$')).toBe(true);
    expect(h1).not.toBe(h2); // per-hash salt
    expect(await verifyPassword(h1, pw)).toBe(true);
    expect(await verifyPassword(h1, pw + 'x')).toBe(false);
    // Malformed stored hash never throws — returns false.
    expect(await verifyPassword('not-a-hash', pw)).toBe(false);
  });
});

describe('security over the live API', () => {
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

  it('never leaks stack traces / internal messages in error envelopes', async () => {
    const anon = await api.get('/api/v1/auth/me');
    const raw = JSON.stringify(anon.body);
    expect(anon.body.error?.code).toBeTruthy();
    expect(raw).not.toMatch(/at Object|node_modules|PrismaClient|SELECT|passwordHash/i);
  });

  it('is SQL-injection safe at the identity boundary: adversarial email is stored, never executed', async () => {
    // Provisioning writes the Clerk-verified email through the parameterized ORM. A hostile payload
    // is treated as inert data, not SQL: the request succeeds, the User table remains queryable.
    const payload = 'bob\'); DROP TABLE "User";--';
    const token = mintClerkToken({ clerkUserId: 'user_inj', email: payload, name: 'Bob' });
    const res = await api.get('/api/v1/auth/me', token);
    expect(res.status).toBe(200);
    // The table still exists and is countable (the injected DDL never ran).
    await expect(prisma.user.count()).resolves.toBe(1);
  });

  it('rejects an unverified Clerk token with a clean 401 and no internal leakage', async () => {
    const res = await api.get('/api/v1/auth/me', 'garbage.not.a.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('INVALID_SESSION');
    expect(JSON.stringify(res.body)).not.toMatch(/at Object|node_modules|PrismaClient|SELECT/i);
  });
});
