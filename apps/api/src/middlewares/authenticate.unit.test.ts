import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../services/identity.service.js', () => ({
  resolveInternalIdentity: vi.fn(async (clerkUserId: string) => ({
    id: `internal-${clerkUserId}`,
  })),
}));

const { apiKeyMayAccess, authenticate } = await import('./authenticate.js');
const { setClerkSeams } = await import('../lib/clerk.js');
const { unauthorized } = await import('../errors/app-error.js');

const W = '/api/v1/workspaces/ws_1';

describe('apiKeyMayAccess', () => {
  it.each([
    '/api/v1/workspaces',
    `${W}/projects`,
    `${W}/projects?status=ACTIVE`,
    `${W}/intelligence/projects/p_1/overview`,
    `${W}/intelligence/personal`,
  ])('allows GET %s', (url) => {
    expect(apiKeyMayAccess('GET', url)).toBe(true);
  });

  it.each([
    ['POST', `${W}/intelligence/dismissals`],
    ['DELETE', `${W}/intelligence/dismissals`],
    ['POST', `${W}/projects`],
    ['GET', '/api/v1/auth/me'],
    ['GET', `${W}/tasks/assigned-to-me`],
    ['GET', `${W}/decisions`],
    ['GET', `${W}/intelligence/projects/p_1/health`],
    ['GET', `${W}/intelligence/projects/p_1/overview/extra`],
    ['GET', `${W}/members`],
  ])('refuses %s %s', (method, url) => {
    expect(apiKeyMayAccess(method, url)).toBe(false);
  });
});

function run(token: string, method = 'GET', url = `${W}/intelligence/personal`) {
  const req = {
    method,
    originalUrl: url,
    header: (name: string) => (name === 'authorization' ? `Bearer ${token}` : undefined),
  } as unknown as Request;
  return new Promise<{ req: Request; error: unknown }>((resolve) => {
    const next: NextFunction = (error?: unknown) => resolve({ req, error });
    void authenticate(req, {} as Response, next);
  });
}

describe('authenticate', () => {
  const session = vi.fn(async () => ({ clerkUserId: 'user_s', sessionId: 'sess_1' }));
  const apiKey = vi.fn(async () => ({ clerkUserId: 'user_k', keyId: 'ak_1' }));

  afterEach(() => {
    session.mockClear();
    apiKey.mockClear();
    setClerkSeams({ verifier: null, apiKeyVerifier: null });
  });

  it('verifies a JWT-shaped bearer as a Clerk session', async () => {
    setClerkSeams({ verifier: session, apiKeyVerifier: apiKey });
    const { req, error } = await run('a.b.c', 'POST', `${W}/intelligence/dismissals`);
    expect(error).toBeUndefined();
    expect(req.auth).toEqual({ userId: 'internal-user_s', sessionId: 'sess_1' });
    expect(apiKey).not.toHaveBeenCalled();
  });

  it('accepts an API key on a read-only route and maps it to its owner', async () => {
    setClerkSeams({ verifier: session, apiKeyVerifier: apiKey });
    const { req, error } = await run('ak_live_secret');
    expect(error).toBeUndefined();
    expect(req.auth).toEqual({ userId: 'internal-user_k', sessionId: 'apikey:ak_1' });
    expect(session).not.toHaveBeenCalled();
  });

  it('treats a non-JWT bearer elsewhere as an invalid session, without calling Clerk', async () => {
    setClerkSeams({ verifier: session, apiKeyVerifier: apiKey });
    const { error } = await run('ak_live_secret', 'POST', `${W}/intelligence/dismissals`);
    expect(error).toMatchObject({ code: 'INVALID_SESSION' });
    expect(apiKey).not.toHaveBeenCalled();
  });

  it('fails closed when the API key is rejected', async () => {
    setClerkSeams({
      verifier: session,
      apiKeyVerifier: vi.fn(async () => {
        throw unauthorized('INVALID_API_KEY', 'API key is invalid, revoked or expired');
      }),
    });
    const { req, error } = await run('ak_revoked');
    expect(error).toMatchObject({ code: 'INVALID_API_KEY' });
    expect(req.auth).toBeUndefined();
  });

  it('requires a bearer token', async () => {
    const req = { method: 'GET', originalUrl: W, header: () => undefined } as unknown as Request;
    const error = await new Promise((resolve) => void authenticate(req, {} as Response, resolve));
    expect(error).toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
