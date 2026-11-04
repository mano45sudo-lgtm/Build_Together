import type { Request, Response } from 'express';
import type { ChangePasswordInput, LoginInput, RegisterInput } from '@buildtogether/shared';
import { unauthorized } from '../errors/app-error.js';
import { asyncHandler } from '../lib/async-handler.js';
import { created, ok } from '../lib/respond.js';
import { requestMeta } from '../lib/http.js';
import * as authService from '../services/auth.service.js';

/**
 * Auth HTTP layer: parse typed input → call the service → emit the shared envelope. Contains no
 * business rules and no Prisma. `register`/`login`/`refresh` return the token pair (consumed by
 * the trusted desktop main process only — ADR-0003); `me` returns just the session view.
 */

/** Narrow `req.auth` (guaranteed present after `authenticate`) or fail closed. */
function needAuth(req: Request): { userId: string; sessionId: string } {
  const auth = req.auth;
  if (!auth) throw unauthorized('UNAUTHENTICATED', 'Authentication required');
  return auth;
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const issued = await authService.register(req.body as RegisterInput, requestMeta(req));
  created(res, issued);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const issued = await authService.login(req.body as LoginInput, requestMeta(req));
  created(res, issued);
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = (req.body as { refreshToken?: string }).refreshToken;
  if (!token) throw unauthorized('INVALID_REFRESH_TOKEN', 'Refresh token required');
  const issued = await authService.refresh(token, requestMeta(req));
  ok(res, issued);
});

/**
 * Sign-out. The route runs an *optional* authenticate, so an already-invalid access token still
 * reaches here — that is a success (nothing left to keep). The family behind the presented refresh
 * token is revoked regardless.
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = (req.body as { refreshToken?: string }).refreshToken;
  if (token) await authService.logout(token);
  ok(res, null);
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = needAuth(req);
  ok(res, await authService.currentSession(userId));
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { userId, sessionId } = needAuth(req);
  const issued = await authService.changePassword(
    userId,
    sessionId,
    req.body as ChangePasswordInput,
    requestMeta(req),
  );
  ok(res, issued);
});
