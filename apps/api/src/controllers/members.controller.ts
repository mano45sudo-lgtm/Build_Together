import type { Request, Response } from 'express';
import type { WorkspaceRole } from '@buildtogether/shared';
import { unauthorized } from '../errors/app-error.js';
import { asyncHandler } from '../lib/async-handler.js';
import { ok } from '../lib/respond.js';
import * as service from '../services/members.service.js';

/**
 * Member management HTTP layer. Route middleware guarantees the caller is a member (list) or an
 * ADMIN (role change / removal); this controller passes the actor + target ids and the resolved
 * actor role down to the service, which enforces the finer ownership rules. No role decision is
 * made here from client-supplied data.
 */
function needUserId(req: Request): string {
  const auth = req.auth;
  if (!auth) throw unauthorized('UNAUTHENTICATED', 'Authentication required');
  return auth.userId;
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await service.listMembers(req.params.workspaceId as string));
});

export const updateRole = asyncHandler(async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;
  const targetUserId = req.params.userId as string;
  await service.updateMemberRole(
    workspaceId,
    needUserId(req),
    targetUserId,
    (req.body as { role: WorkspaceRole }).role,
  );
  ok(res, null);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.removeMember(
    req.params.workspaceId as string,
    needUserId(req),
    req.params.userId as string,
  );
  ok(res, null);
});

export const transfer = asyncHandler(async (req: Request, res: Response) => {
  await service.transferOwnership(
    req.params.workspaceId as string,
    needUserId(req),
    req.params.userId as string,
  );
  ok(res, null);
});
