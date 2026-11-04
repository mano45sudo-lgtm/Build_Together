import type { Request, Response } from 'express';
import type { AcceptInvitationInput, CreateInvitationInput } from '@buildtogether/shared';
import { unauthorized } from '../errors/app-error.js';
import { asyncHandler } from '../lib/async-handler.js';
import { created, ok } from '../lib/respond.js';
import * as service from '../services/invitations.service.js';

/**
 * Invitation HTTP layer. `create`/`list`/`revoke` are workspace-scoped (route required ADMIN);
 * `accept` and `pendingForMe` act on the authenticated user's own email. The raw token is only ever
 * sent by the client that received it (dev link) and is validated server-side in the service.
 */
function needUserId(req: Request): string {
  const auth = req.auth;
  if (!auth) throw unauthorized('UNAUTHENTICATED', 'Authentication required');
  return auth.userId;
}

export const create = asyncHandler(async (req: Request, res: Response) => {
  const out = await service.createInvitation(
    req.params.workspaceId as string,
    needUserId(req),
    req.body as CreateInvitationInput,
  );
  created(res, out);
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await service.listInvitations(req.params.workspaceId as string));
});

export const revoke = asyncHandler(async (req: Request, res: Response) => {
  await service.revokeInvitation(
    req.params.workspaceId as string,
    req.params.invitationId as string,
  );
  ok(res, null);
});

export const accept = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body as AcceptInvitationInput;
  ok(res, await service.acceptInvitation(token, needUserId(req)));
});

export const pendingForMe = asyncHandler(async (req: Request, res: Response) => {
  ok(res, await service.pendingForUser(needUserId(req)));
});
