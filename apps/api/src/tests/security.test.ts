import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { makeAuthLimiter } from '../middlewares/rate-limit.js';
import { errorHandler } from '../middlewares/error-handler.js';
import { requestLog } from '../middlewares/request-log.js';
import { PASSWORD, resetDb, TestApi } from '../test/harness.js';
import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword } from '../lib/password.js';

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
  });

  it('never leaks stack traces / internal messages in error envelopes', async () => {
    const anon = await api.get('/api/v1/auth/me');
    const raw = JSON.stringify(anon.body);
    expect(anon.body.error?.code).toBeTruthy();
    expect(raw).not.toMatch(/at Object|node_modules|PrismaClient|SELECT|passwordHash/i);
  });

  it('is SQL-injection safe: adversarial email input is rejected, never executed', async () => {
    // Parameterized ORM + email validation means a payload is just an invalid email (400), and it
    // cannot be persisted. We assert no user row was created and the response is a clean 400.
    const payload = 'bob\'); DROP TABLE "User";--';
    const res = await api.post('/api/v1/auth/register', {
      name: 'Bob',
      email: payload,
      password: PASSWORD,
    });
    expect(res.status).toBe(400);
    // The User table still exists and is queryable.
    await expect(prisma.user.count()).resolves.toBe(0);
  });

  it('enforces a minimum password length (weak passwords rejected)', async () => {
    const res = await api.post('/api/v1/auth/register', {
      name: 'Weak',
      email: 'weak@example.com',
      password: 'short',
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.details?.password).toBeInstanceOf(Array);
  });

  it('does not disclose account existence at login and never returns the hash', async () => {
    await api.registerAs('Real', 'real@example.com', PASSWORD);
    const miss = await api.post('/api/v1/auth/login', {
      email: 'nobody@example.com',
      password: 'whatever-12345',
    });
    const badPw = await api.post('/api/v1/auth/login', {
      email: 'real@example.com',
      password: 'whatever-12345',
    });
    expect(miss.body.error).toEqual(badPw.body.error);
    expect(JSON.stringify(miss.body)).not.toMatch(/passwordHash/i);
  });
});
