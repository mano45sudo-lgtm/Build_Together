import type { WorkspaceRole } from '@buildtogether/shared';
import { ROLE_RANK } from '@buildtogether/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { forbidden, unauthorized } from '../errors/app-error.js';
import * as workspaceRepo from '../repositories/workspace.repo.js';

/**
 * Server-side membership + role gate for a workspace-scoped route. Runs after `authenticate`.
 *
 * Resolves `:workspaceId`, then checks the caller's membership **freshly against the database**
 * (via the workspace repository — never trusting anything the client claims) and enforces the role
 * hierarchy. Authorization is always performed here and in services — the desktop UI hiding a
 * control is never the security boundary. Non-members and under-privileged members both get 403, so
 * workspace ids are not enumerable by privilege. Attaches `{ workspaceId, role }` to `req.workspace`.
 */
export function requireWorkspaceRole(minimum: WorkspaceRole): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const auth = req.auth;
      if (!auth) throw unauthorized('UNAUTHENTICATED', 'Authentication required');

      // A path param is always a single segment; Express types it as `string | string[]`, so we
      // narrow to the string form (and reject a repeated `workspaceId` as if it were absent).
      const rawWorkspaceId = req.params.workspaceId;
      const workspaceId = typeof rawWorkspaceId === 'string' ? rawWorkspaceId : undefined;
      if (!workspaceId) throw forbidden('WORKSPACE_NOT_SELECTED', 'No workspace selected');

      const role = await workspaceRepo.getRole(workspaceId, auth.userId);
      if (!role) {
        throw forbidden('NOT_A_MEMBER', 'You do not have access to this workspace');
      }
      if (ROLE_RANK[role] < ROLE_RANK[minimum]) {
        throw forbidden('INSUFFICIENT_ROLE', 'You do not have permission to perform this action');
      }

      req.workspace = { workspaceId, role };
      next();
    } catch (err) {
      next(err);
    }
  };
}
