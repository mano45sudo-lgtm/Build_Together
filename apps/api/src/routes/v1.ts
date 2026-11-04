import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { invitationsRouter } from './invitations.routes.js';
import { usersRouter } from './users.routes.js';
import { workspacesRouter } from './workspaces.routes.js';

/**
 * The `/api/v1` surface. Versioned so a future breaking change ships as `/api/v2` without stranding
 * existing desktop builds. Each feature router carries its own auth / validation / RBAC middleware.
 */
export const v1Router = Router();

v1Router.use('/auth', authRouter);
v1Router.use('/users', usersRouter);
v1Router.use('/workspaces', workspacesRouter);
v1Router.use('/invitations', invitationsRouter);
