import type { Request, Response } from 'express';
import type { CreateTaskInput, TaskListQuery, UpdateTaskInput } from '@buildtogether/shared';
import { forbidden, notFound, unauthorized } from '../errors/app-error.js';
import { asyncHandler } from '../lib/async-handler.js';
import { created, ok } from '../lib/respond.js';
import * as service from '../services/task.service.js';

/**
 * Tasks HTTP layer. The route middleware already guaranteed `req.auth` (authenticated) and
 * `req.workspace` (server-verified membership + role for the path workspace). This layer extracts only
 * trusted context (never a client-supplied workspace/user id) and delegates to the service, which does
 * the project-boundary + role + dependency-legality checks.
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

function needParam(req: Request, name: string, code: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value.length === 0) throw notFound(code, `${name} not found`);
  return value;
}

const callerOf = (req: Request) => ({ userId: needUserId(req), role: needWorkspace(req).role });

// ---- collection (project-scoped) ----

export const listByProject = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId } = needWorkspace(req);
  const projectId = needParam(req, 'projectId', 'PROJECT_NOT_FOUND');
  const query = (req.validatedQuery ?? {}) as TaskListQuery;
  const result = await service.listTasks(workspaceId, projectId, callerOf(req), query);
  const meta = result.nextCursor
    ? { cursor: result.nextCursor, ...(query.limit ? { limit: query.limit } : {}) }
    : undefined;
  ok(res, result.items, meta);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId } = needWorkspace(req);
  const projectId = needParam(req, 'projectId', 'PROJECT_NOT_FOUND');
  const task = await service.createTask(
    workspaceId,
    projectId,
    callerOf(req),
    req.body as CreateTaskInput,
  );
  created(res, task);
});

// ---- My Work (workspace-scoped, across visible projects) ----

export const assignedToMe = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId } = needWorkspace(req);
  ok(res, await service.listMyTasks(workspaceId, callerOf(req)));
});

// ---- single task ----

export const get = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId } = needWorkspace(req);
  const taskId = needParam(req, 'taskId', 'TASK_NOT_FOUND');
  ok(res, await service.getTask(taskId, workspaceId, callerOf(req)));
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId } = needWorkspace(req);
  const taskId = needParam(req, 'taskId', 'TASK_NOT_FOUND');
  ok(
    res,
    await service.updateTask(taskId, workspaceId, callerOf(req), req.body as UpdateTaskInput),
  );
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId } = needWorkspace(req);
  const taskId = needParam(req, 'taskId', 'TASK_NOT_FOUND');
  ok(res, await service.deleteTask(taskId, workspaceId, callerOf(req)));
});

export const assign = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId } = needWorkspace(req);
  const taskId = needParam(req, 'taskId', 'TASK_NOT_FOUND');
  const body = req.body as { assigneeId: string | null };
  ok(res, await service.assignTask(taskId, workspaceId, callerOf(req), body.assigneeId));
});

export const changeStatus = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId } = needWorkspace(req);
  const taskId = needParam(req, 'taskId', 'TASK_NOT_FOUND');
  const body = req.body as { status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE' };
  ok(res, await service.changeStatus(taskId, workspaceId, callerOf(req), body.status));
});

// ---- dependencies ----

export const getDependencies = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId } = needWorkspace(req);
  const taskId = needParam(req, 'taskId', 'TASK_NOT_FOUND');
  ok(res, await service.getDependencies(taskId, workspaceId, callerOf(req)));
});

export const addDependency = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId } = needWorkspace(req);
  const taskId = needParam(req, 'taskId', 'TASK_NOT_FOUND');
  const body = req.body as { dependsOnTaskId: string };
  ok(res, await service.addDependency(taskId, workspaceId, callerOf(req), body.dependsOnTaskId));
});

export const removeDependency = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId } = needWorkspace(req);
  const taskId = needParam(req, 'taskId', 'TASK_NOT_FOUND');
  const dependencyId = needParam(req, 'dependencyId', 'DEPENDENCY_NOT_FOUND');
  ok(res, await service.removeDependency(taskId, workspaceId, callerOf(req), dependencyId));
});

// ---- activity ----

export const activity = asyncHandler(async (req: Request, res: Response) => {
  const { workspaceId } = needWorkspace(req);
  const taskId = needParam(req, 'taskId', 'TASK_NOT_FOUND');
  const query = (req.validatedQuery ?? {}) as { limit?: number; cursor?: string };
  const result = await service.listActivity(taskId, workspaceId, callerOf(req), query);
  const meta = result.nextCursor
    ? { cursor: result.nextCursor, ...(query.limit ? { limit: query.limit } : {}) }
    : undefined;
  ok(res, result.items, meta);
});
