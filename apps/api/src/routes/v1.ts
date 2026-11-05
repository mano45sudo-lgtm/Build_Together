import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { invitationsRouter } from './invitations.routes.js';
import { projectsRouter } from './projects.routes.js';
import { decisionsRouter } from './decisions.routes.js';
import { intelligenceRouter } from './intelligence.routes.js';
import { intelligenceLimiter } from '../middlewares/rate-limit.js';
import { tasksRouter } from './tasks.routes.js';
import { usersRouter } from './users.routes.js';
import { workspacesRouter } from './workspaces.routes.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireWorkspaceRole } from '../middlewares/workspace-scope.js';
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

// Phase 4 projects. Workspace-scoped like chat, but the membership + role gate is applied once at the
// mount point: every `/workspaces/:workspaceId/projects…` request is proven (fresh, from the DB) to be
// a member of the PATH workspace before any project handler runs; the service then adds the finer
// OWNER/ADMIN-vs-owner/creator rules. Mounted before chatRouter so its `/conversations…` fallthrough
// is never reached by a `/projects` path.
v1Router.use(
  '/workspaces/:workspaceId/projects',
  authenticate,
  requireWorkspaceRole('MEMBER'),
  projectsRouter,
);

// Phase 5 tasks. Workspace-scoped exactly like projects: the membership + role gate is applied once at
// the mount point, so every `/workspaces/:workspaceId/...tasks…` request is a proven member of the PATH
// workspace before any handler runs; the task service then adds the project visibility/ownership and
// dependency-legality rules. Mounted after projectsRouter (its `/projects…` fallthrough never reaches a
// `/projects/:projectId/tasks` path here first) and before chatRouter.
v1Router.use('/workspaces/:workspaceId', authenticate, requireWorkspaceRole('MEMBER'), tasksRouter);

// Phase 6 Decision Vault. Workspace-scoped exactly like projects/tasks: the mount point proves
// membership fresh from the DB; the decision service adds project-visibility, management and
// lifecycle rules. Mounted alongside the other workspace feature routers (distinct /decisions
// prefix, so no path can collide with /projects…, /tasks… or /conversations…).
v1Router.use(
  '/workspaces/:workspaceId/decisions',
  authenticate,
  requireWorkspaceRole('MEMBER'),
  decisionsRouter,
);

// Phase 7 execution intelligence. Workspace-scoped exactly like projects/tasks/decisions: the mount
// point proves membership fresh from the DB; the orchestrator then re-checks project visibility per
// request before computing any signal. Every endpoint is a derived READ (plus the caller's own
// dismissal writes) — it can never mutate a task/decision. Distinct /intelligence prefix, so no path
// collides with /projects…, /tasks…, /decisions… or /conversations…. Throttled by its own limiter.
v1Router.use(
  '/workspaces/:workspaceId/intelligence',
  authenticate,
  requireWorkspaceRole('MEMBER'),
  intelligenceLimiter,
  intelligenceRouter,
);

// Phase 3 chat. Mounted AFTER workspacesRouter so its `/:workspaceId/...` sub-paths (chat token,
// conversations) are matched here without colliding with the workspace/member/invitation routes;
// mergeParams exposes `:workspaceId` to `requireWorkspaceRole`. Provider callbacks ride a separate,
// unauthenticated surface whose authenticity is the App-Secret signature.
v1Router.use('/workspaces/:workspaceId', chatRouter);
v1Router.use('/webhooks', chatWebhookRouter);
