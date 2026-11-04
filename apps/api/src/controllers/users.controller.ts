import type { Request, Response } from 'express';
import type { UpdateProfileInput } from '@buildtogether/shared';
import { unauthorized } from '../errors/app-error.js';
import { asyncHandler } from '../lib/async-handler.js';
import { ok } from '../lib/respond.js';
import * as profileService from '../services/workspace.service.js';

/**
 * User-profile HTTP layer (`/users/me`). Reads/updates the authenticated user's own profile only —
 * there is no arbitrary-user access in Phase 2 (no directory), matching the brief's minimal scope.
 */
function needUserId(req: Request): string {
  const auth = req.auth;
  if (!auth) throw unauthorized('UNAUTHENTICATED', 'Authentication required');
  return auth.userId;
}

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await profileService.getProfile(needUserId(req)));
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await profileService.updateProfile(needUserId(req), req.body as UpdateProfileInput));
});
