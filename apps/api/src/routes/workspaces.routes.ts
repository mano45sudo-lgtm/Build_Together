import { Router } from 'express';
import * as invitationsController from '../controllers/invitations.controller.js';
import * as membersController from '../controllers/members.controller.js';
import * as workspacesController from '../controllers/workspaces.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireWorkspaceRole } from '../middlewares/workspace-scope.js';
import { inviteLimiter } from '../middlewares/rate-limit.js';
import { validate } from '../middlewares/validate.js';
import {
  createInvitationSchema,
  createWorkspaceSchema,
  updateMemberRoleSchema,
  updateWorkspaceSchema,
} from '../validation/schemas.js';

/**
 * Workspace-scoped routes (mounted at `/api/v1/workspaces`). The collection routes (list/create)
 * require only authentication; every `/:workspaceId` route runs `requireWorkspaceRole` FIRST, which
 * re-checks membership + role hierarchy against the database — so cross-workspace access and
 * under-privileged actions are rejected server-side, never by client UI.
 */
export const workspacesRouter = Router();

// Collection level.
workspacesRouter.get('/', authenticate, workspacesController.list);
workspacesRouter.post(
  '/',
  authenticate,
  validate(createWorkspaceSchema),
  workspacesController.create,
);

// Single workspace.
workspacesRouter.get(
  '/:workspaceId',
  authenticate,
  requireWorkspaceRole('MEMBER'),
  workspacesController.get,
);
workspacesRouter.patch(
  '/:workspaceId',
  authenticate,
  requireWorkspaceRole('ADMIN'),
  validate(updateWorkspaceSchema),
  workspacesController.update,
);

// Members.
workspacesRouter.get(
  '/:workspaceId/members',
  authenticate,
  requireWorkspaceRole('MEMBER'),
  membersController.list,
);
workspacesRouter.patch(
  '/:workspaceId/members/:userId',
  authenticate,
  requireWorkspaceRole('ADMIN'),
  validate(updateMemberRoleSchema),
  membersController.updateRole,
);
// A member may remove THEMSELVES (leave); removing anyone else requires ADMIN — the service
// enforces that finer rule, so the middleware only requires membership.
workspacesRouter.delete(
  '/:workspaceId/members/:userId',
  authenticate,
  requireWorkspaceRole('MEMBER'),
  membersController.remove,
);
// Ownership transfer is owner-only (the service also verifies, defense-in-depth).
workspacesRouter.post(
  '/:workspaceId/members/:userId/transfer',
  authenticate,
  requireWorkspaceRole('OWNER'),
  membersController.transfer,
);

// Invitations (workspace-scoped management).
workspacesRouter.post(
  '/:workspaceId/invitations',
  authenticate,
  requireWorkspaceRole('ADMIN'),
  inviteLimiter,
  validate(createInvitationSchema),
  invitationsController.create,
);
workspacesRouter.get(
  '/:workspaceId/invitations',
  authenticate,
  requireWorkspaceRole('ADMIN'),
  invitationsController.list,
);
workspacesRouter.delete(
  '/:workspaceId/invitations/:invitationId',
  authenticate,
  requireWorkspaceRole('ADMIN'),
  invitationsController.revoke,
);
