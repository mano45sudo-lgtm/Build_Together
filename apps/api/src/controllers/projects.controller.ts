import type { Request, Response } from 'express';
import type {
  CreateProjectInput,
  ProjectListQuery,
  UpdateProjectInput,
} from '@buildtogether/shared';
import { forbidden, unauthorized } from '../errors/app-error.js';
import { asyncHandler } from '../lib/async-handler.js';
import { created, ok } from '../lib/respond.js';
import * as service from '../services/project.service.js';

/**
 * Projects HTTP layer. The route middleware already guaranteed `req.auth` (authenticated) and
 * `req.workspace` (server-verified membership + role for the path workspace). This layer only extracts
 * trusted context (never a client-supplied workspace/user id) and delegates to the service.
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

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId, role } = needWorkspace(req);
  const query = (req.validatedQuery ?? {}) as ProjectListQuery;
  const result = await service.listProjects(workspaceId, { userId: needUserId(req), role }, query);
  // Expose the forward cursor + applied limit in the envelope meta so clients paginate without guessing.
  const meta = result.nextCursor
    ? { cursor: result.nextCursor, ...(query.limit ? { limit: query.limit } : {}) }
    : undefined;
  ok(res, result.items, meta);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId, role } = needWorkspace(req);
  const project = await service.createProject(
    workspaceId,
    { userId: needUserId(req), role },
    req.body as CreateProjectInput,
  );
  created(res, project);
});

export const get = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId, role } = needWorkspace(req);
  ok(
    res,
    await service.getProject(needProjectId(req), workspaceId, { userId: needUserId(req), role }),
  );
});

export const overview = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId, role } = needWorkspace(req);
  ok(
    res,
    await service.getOverview(needProjectId(req), workspaceId, {
      userId: needUserId(req),
      role,
    }),
  );
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId, role } = needWorkspace(req);
  ok(
    res,
    await service.updateProject(
      needProjectId(req),
      workspaceId,
      { userId: needUserId(req), role },
      req.body as UpdateProjectInput,
    ),
  );
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId, role } = needWorkspace(req);
  ok(
    res,
    await service.archiveProject(needProjectId(req), workspaceId, {
      userId: needUserId(req),
      role,
    }),
  );
});

export const restore = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId, role } = needWorkspace(req);
  ok(
    res,
    await service.restoreProject(needProjectId(req), workspaceId, {
      userId: needUserId(req),
      role,
    }),
  );
});
