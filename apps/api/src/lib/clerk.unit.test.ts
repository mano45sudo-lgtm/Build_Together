import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyTokenMock } = vi.hoisted(() => ({ verifyTokenMock: vi.fn() }));
vi.mock('@clerk/backend', () => ({
  createClerkClient: vi.fn(),
  verifyToken: (...args: unknown[]) => verifyTokenMock(...args),
}));

describe('Clerk session verification adapter', () => {
  beforeEach(() => {
    // The global setup imports the Clerk fixture (and therefore this adapter) before this file's
    // @clerk/backend mock is evaluated. Clear that cached adapter so the mock is applied at its
    // actual SDK boundary on the dynamic import below.
    vi.resetModules();
    verifyTokenMock.mockReset();
    process.env.CLERK_SECRET_KEY = 'server-secret-placeholder';
    process.env.CLERK_JWT_ISSUER = 'https://issuer.example.test';
    process.env.CLERK_AUTHORIZED_PARTIES = 'app://bundle';
    process.env.CLERK_JWT_AUDIENCE = 'cue-api';
  });

  it('uses the Clerk SDK with configured issuer, audience and authorized-party checks', async () => {
    verifyTokenMock.mockResolvedValue({ sub: 'user_clerk_1', sid: 'sess_1' });
    const { verifyClerkSessionToken } = await import('./clerk.js');
    await expect(verifyClerkSessionToken('opaque-token')).resolves.toEqual({
      clerkUserId: 'user_clerk_1',
      sessionId: 'sess_1',
    });
    expect(verifyTokenMock).toHaveBeenCalledWith(
      'opaque-token',
      expect.objectContaining({
        issuer: 'https://issuer.example.test',
        audience: 'cue-api',
        authorizedParties: ['app://bundle'],
      }),
    );
  });

  it.each([
    ['invalid signature', new Error('signature')],
    ['expired token', new Error('expired')],
    ['wrong issuer', new Error('issuer')],
    ['wrong authorized party', new Error('azp')],
  ])(
    'rejects %s through the SDK and returns a safe authentication error',
    async (_label, failure) => {
      verifyTokenMock.mockRejectedValue(failure);
      const { verifyClerkSessionToken } = await import('./clerk.js');
      await expect(verifyClerkSessionToken('opaque-token')).rejects.toMatchObject({
        statusCode: 401,
        code: 'INVALID_SESSION',
      });
    },
  );

  it('rejects a verified payload without a Clerk subject', async () => {
    verifyTokenMock.mockResolvedValue({ sid: 'session_without_subject' });
    const { verifyClerkSessionToken } = await import('./clerk.js');
    await expect(verifyClerkSessionToken('opaque-token')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_SESSION',
    });
  });
});
