import type { Request, Response } from 'express';
import type { CreateWorkspaceInput, UpdateWorkspaceInput } from '@buildtogether/shared';
import { unauthorized } from '../errors/app-error.js';
import { asyncHandler } from '../lib/async-handler.js';
import { created, ok } from '../lib/respond.js';
import * as service from '../services/workspace.service.js';

/**
 * Workspace HTTP layer. `list`/`create` operate on the collection (authenticated only); the
 * `:workspaceId` routes have already passed `requireWorkspaceRole` so `req.workspace` is present
 * and the caller is authorized for that workspace (server-side membership verified).
 */
function needUserId(req: Request): string {
  const auth = req.auth;
  if (!auth) throw unauthorized('UNAUTHENTICATED', 'Authentication required');
  return auth.userId;
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await service.listWorkspaces(needUserId(req)));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const ws = await service.createWorkspace(needUserId(req), req.body as CreateWorkspaceInput);
  created(res, ws);
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await service.getWorkspace(req.params.workspaceId as string, needUserId(req)));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  ok(
    res,
    await service.updateWorkspace(
      req.params.workspaceId as string,
      needUserId(req),
      req.body as UpdateWorkspaceInput,
    ),
  );
});
