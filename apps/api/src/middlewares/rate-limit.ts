import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { env } from '../lib/env.js';

/**
 * Brute-force / abuse throttles for the credential and invitation endpoints. Keyed by client
 * IP — appropriate because the desktop main process talks to the hosted API directly. Each returns
 * the shared error envelope (rather than express-rate-limit's default text body) so the client
 * parses a 429 exactly like any other failure. `draft-7` sets standard RateLimit-* headers.
 *
 * Limits are env-configurable: the defaults are production-sane (auth 10 / 15 min) while the test
 * harness raises them (via AUTH_RATE_LIMIT) so integration tests aren't throttled — a dedicated
 * security test then exercises the throttle with `makeAuthLimiter(n)` on its own tiny app.
 */
export function makeAuthLimiter(limit: number = env.authRateLimit): RequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Only count failed attempts so a legitimate user isn't locked out by their own successes.
    skipSuccessfulRequests: true,
    message: {
      data: null,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many authentication attempts, please try again later',
      },
    },
  });
}

export function makeInviteLimiter(limit: number = env.inviteRateLimit): RequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      data: null,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many invitation requests, please try again later',
      },
    },
  });
}

/** Strict limiter for login/register/refresh/accept: max AUTH_RATE_LIMIT / 15 min per IP. */
export const authLimiter: RequestHandler = makeAuthLimiter();

/** Looser limiter for invitation creation (spam control): max INVITE_RATE_LIMIT / 15 min per IP. */
export const inviteLimiter: RequestHandler = makeInviteLimiter();
