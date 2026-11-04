import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { invitationsRouter } from './invitations.routes.js';
import { usersRouter } from './users.routes.js';
import { workspacesRouter } from './workspaces.routes.js';
import { chatRouter, chatWebhookRouter } from '../modules/chat/chat.routes.js';

/**
 * The `/api/v1` surface. Versioned so a future breaking change ships as `/api/v2` without stranding
 * existing desktop builds. Each feature router carries its own auth / validation / RBAC middleware.
 */
export const v1Router = Router();

v1Router.use('/auth', authRouter);
v1Router.use('/users', usersRouter);
v1Router.use('/workspaces', workspacesRouter);
v1Router.use('/invitations', invitationsRouter);

// Phase 3 chat. Mounted AFTER workspacesRouter so its `/:workspaceId/...` sub-paths (chat token,
// conversations) are matched here without colliding with the workspace/member/invitation routes;
// mergeParams exposes `:workspaceId` to `requireWorkspaceRole`. Provider callbacks ride a separate,
// unauthenticated surface whose authenticity is the App-Secret signature.
v1Router.use('/workspaces/:workspaceId', chatRouter);
v1Router.use('/webhooks', chatWebhookRouter);
