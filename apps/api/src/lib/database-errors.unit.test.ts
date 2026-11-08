import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { isDatabaseUnavailableError } from './database-errors.js';
import { errorHandler } from '../middlewares/error-handler.js';
import { conflict } from '../errors/app-error.js';

function knownError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('driver detail that must not leak', {
    code,
    clientVersion: 'test',
  });
}

function respond(err: unknown) {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  errorHandler(
    err,
    { requestId: 'req-1', path: '/api/v1/auth/me' } as unknown as Request,
    res as unknown as Response,
    (() => undefined) as NextFunction,
  );
  return { status: res.status.mock.calls[0]?.[0], body: res.json.mock.calls[0]?.[0] };
}

describe('isDatabaseUnavailableError', () => {
  it.each(['ECONNREFUSED', 'ETIMEDOUT', 'P1001', 'P1017', 'P2024', '57P01'])(
    'treats %s as an outage',
    (code) => {
      expect(isDatabaseUnavailableError(knownError(code))).toBe(true);
    },
  );

  it('treats client initialization failures as an outage', () => {
    const error = new Prisma.PrismaClientInitializationError('cannot connect', 'test');
    expect(isDatabaseUnavailableError(error)).toBe(true);
  });

  it.each(['P2002', 'P2025'])('does not hide query errors such as %s', (code) => {
    expect(isDatabaseUnavailableError(knownError(code))).toBe(false);
  });

  it('ignores non-Prisma errors', () => {
    expect(isDatabaseUnavailableError(new Error('ECONNREFUSED'))).toBe(false);
  });
});

describe('errorHandler', () => {
  it('returns a retryable 503 for an unreachable database without leaking driver detail', () => {
    const { status, body } = respond(knownError('ECONNREFUSED'));
    expect(status).toBe(503);
    expect(body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toMatch(/driver detail/);
  });

  it('still maps unknown failures to a generic 500', () => {
    const { status, body } = respond(knownError('P2002'));
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('keeps domain errors unchanged', () => {
    const { status, body } = respond(conflict('IDENTITY_EMAIL_CLASH', 'Already linked'));
    expect(status).toBe(409);
    expect(body.error.code).toBe('IDENTITY_EMAIL_CLASH');
  });
});
