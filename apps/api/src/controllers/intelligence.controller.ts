import type { Request, Response } from 'express';
import type { CreateDismissalInput } from '@buildtogether/shared';
import { forbidden, unauthorized } from '../errors/app-error.js';
import { asyncHandler } from '../lib/async-handler.js';
import { created, ok } from '../lib/respond.js';
import * as service from '../services/intelligence.service.js';

/**
 * Intelligence HTTP layer (Phase 7). Route middleware already guaranteed `req.auth` (authenticated) and
 * `req.workspace` (server-verified membership + role for the PATH workspace). This layer only extracts
 * trusted context — never a client-supplied workspace/user id — and delegates to the orchestrator,
 * which does the project-visibility authorization. All reads are derived on demand; the only write is
 * the caller's own dismissal state.
 */

function needUserId(req: Request): string {
  const auth = req.auth;
  if (!auth) throw unauthorized('UNAUTHENTICATED', 'Authentication required');
  return auth.userId;
}

function needWorkspace(req: Request): { workspaceId: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' } {
  const ws = req.workspace;
  if (!ws) throw forbidden('WORKSPACE_NOT_SELECTED', 'No workspace selected');
  return { workspaceId: ws.workspaceId, role: ws.role };
}

function needProjectId(req: Request): string {
  const id = req.params.projectId;
  if (typeof id !== 'string') throw forbidden('PROJECT_NOT_FOUND', 'Project not found');
  return id;
}

/** Optional deadline window from the validated query; undefined lets the service use its default. */
function windowDays(req: Request): number | undefined {
  const q = req.validatedQuery as { deadlineWindowDays?: number } | undefined;
  return q?.deadlineWindowDays;
}

function caller(req: Request): { userId: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' } {
  return { userId: needUserId(req), role: needWorkspace(req).role };
}

export const overview = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId } = needWorkspace(req);
  ok(
    res,
    await service.getProjectIntelligence(
      needProjectId(req),
      workspaceId,
      caller(req),
      windowDays(req),
    ),
  );
});

export const health = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId } = needWorkspace(req);
  const data = await service.getProjectIntelligence(
    needProjectId(req),
    workspaceId,
    caller(req),
    windowDays(req),
  );
  ok(res, data.health);
});

export const blockers = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId } = needWorkspace(req);
  const data = await service.getProjectIntelligence(
    needProjectId(req),
    workspaceId,
    caller(req),
    windowDays(req),
  );
  ok(res, data.blockers);
});

export const risks = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId } = needWorkspace(req);
  const data = await service.getProjectIntelligence(
    needProjectId(req),
    workspaceId,
    caller(req),
    windowDays(req),
  );
  ok(res, data.risks);
});

export const recommendations = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId } = needWorkspace(req);
  const data = await service.getProjectIntelligence(
    needProjectId(req),
    workspaceId,
    caller(req),
    windowDays(req),
  );
  ok(res, data.recommendations);
});

export const decisionImpacts = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId } = needWorkspace(req);
  const data = await service.getProjectIntelligence(
    needProjectId(req),
    workspaceId,
    caller(req),
    windowDays(req),
  );
  ok(res, data.decisionImpacts);
});

export const personal = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId } = needWorkspace(req);
  ok(res, await service.getPersonalIntelligence(workspaceId, caller(req), windowDays(req)));
});

export const dismiss = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId } = needWorkspace(req);
  created(
    res,
    await service.recordDismissal(workspaceId, caller(req), req.body as CreateDismissalInput),
  );
});

export const undismiss = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId } = needWorkspace(req);
  const body = req.body as CreateDismissalInput;
  await service.removeDismissal(workspaceId, caller(req), {
    kind: body.kind,
    dedupKey: body.dedupKey,
  });
  ok(res, null);
});
