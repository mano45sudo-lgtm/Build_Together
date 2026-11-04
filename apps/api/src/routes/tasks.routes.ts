import { Router } from 'express';
import { validate, validateQuery } from '../middlewares/validate.js';
import {
  addTaskDependencySchema,
  assignTaskSchema,
  changeTaskStatusSchema,
  createTaskSchema,
  taskActivityQuerySchema,
  taskListQuerySchema,
  updateTaskSchema,
} from '../validation/tasks.schemas.js';
import * as controller from '../controllers/tasks.controller.js';

/**
 * Task routes, mounted at `/api/v1/workspaces/:workspaceId` (mergeParams) AFTER `authenticate` +
 * `requireWorkspaceRole('MEMBER')` are applied at the mount point (see v1.ts). So every request here is
 * already a verified member of the PATH workspace, and every `:projectId` / `:taskId` is resolved
 * against that workspace server-side (a foreign id reads as 404). The task SERVICE adds the project
 * visibility/ownership and dependency-legality rules on top.
 *
 * Note `/tasks/assigned-to-me` is declared BEFORE `/tasks/:taskId` so the literal segment is never
 * captured as an id.
 */
export const tasksRouter = Router({ mergeParams: true });

// Collection (project-scoped).
tasksRouter.get(
  '/projects/:projectId/tasks',
  validateQuery(taskListQuerySchema),
  controller.listByProject,
);
tasksRouter.post('/projects/:projectId/tasks', validate(createTaskSchema), controller.create);

// My Work aggregate.
tasksRouter.get('/tasks/assigned-to-me', controller.assignedToMe);

// Single task.
tasksRouter.get('/tasks/:taskId', controller.get);
tasksRouter.patch('/tasks/:taskId', validate(updateTaskSchema), controller.update);
tasksRouter.delete('/tasks/:taskId', controller.remove);

// Focused ownership + workflow mutations (typed activity, distinct from a general PATCH).
tasksRouter.patch('/tasks/:taskId/assignee', validate(assignTaskSchema), controller.assign);
tasksRouter.patch(
  '/tasks/:taskId/status',
  validate(changeTaskStatusSchema),
  controller.changeStatus,
);

// Dependencies.
tasksRouter.get('/tasks/:taskId/dependencies', controller.getDependencies);
tasksRouter.post(
  '/tasks/:taskId/dependencies',
  validate(addTaskDependencySchema),
  controller.addDependency,
);
tasksRouter.delete('/tasks/:taskId/dependencies/:dependencyId', controller.removeDependency);

// Activity history (paginated).
tasksRouter.get(
  '/tasks/:taskId/activity',
  validateQuery(taskActivityQuerySchema),
  controller.activity,
);
