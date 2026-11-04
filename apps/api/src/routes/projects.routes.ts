import { Router } from 'express';
import { validate, validateQuery } from '../middlewares/validate.js';
import {
  createProjectSchema,
  projectListQuerySchema,
  updateProjectSchema,
} from '../validation/projects.schemas.js';
import * as controller from '../controllers/projects.controller.js';

/**
 * Workspace-scoped project routes, mounted at `/api/v1/workspaces/:workspaceId/projects` (mergeParams)
 * AFTER `authenticate` + `requireWorkspaceRole('MEMBER')` are applied at the mount point (see v1.ts).
 * So every route here already knows the caller is a verified member of the PATH workspace, and
 * `:projectId` reads are always scoped to that workspace (cross-workspace id → 404). The project
 * SERVICE adds the finer OWNER/ADMIN-vs-owner/creator rules per operation.
 */
export const projectsRouter = Router({ mergeParams: true });

// Collection.
projectsRouter.get('/', validateQuery(projectListQuerySchema), controller.list);
projectsRouter.post('/', validate(createProjectSchema), controller.create);

// Single project + overview.
projectsRouter.get('/:projectId', controller.get);
projectsRouter.get('/:projectId/overview', controller.overview);

// Update + lifecycle.
projectsRouter.patch('/:projectId', validate(updateProjectSchema), controller.update);
projectsRouter.post('/:projectId/archive', controller.archive);
projectsRouter.post('/:projectId/restore', controller.restore);
