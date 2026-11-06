import type { Request, Response } from 'express';
import { unauthorized } from '../errors/app-error.js';
import { asyncHandler } from '../lib/async-handler.js';
import { ok } from '../lib/respond.js';
import * as authService from '../services/auth.service.js';

/**
 * Auth HTTP layer (ADR-0006). Clerk owns sign up/in, refresh, and password reset — there are no
 * credential endpoints here. The only server concern left is returning the current session view for
 * an already-authenticated request (`me`), which the `authenticate` middleware has verified against
 * Clerk and mapped onto an internal identity. Contains no business rules and no Prisma.
 */

/** Narrow `req.auth` (guaranteed present after `authenticate`) or fail closed. */
function needUserId(req: Request): string {
  const auth = req.auth;
  if (!auth) throw unauthorized('UNAUTHENTICATED', 'Authentication required');
  return auth.userId;
}

export const me = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await authService.currentSession(needUserId(req)));
});
