import { Router } from 'express';
import { validate, validateQuery } from '../middlewares/validate.js';
import {
  createDismissalSchema,
  deleteDismissalSchema,
  intelligenceQuerySchema,
} from '../validation/intelligence.schemas.js';
import * as controller from '../controllers/intelligence.controller.js';

/**
 * Workspace-scoped execution-intelligence routes, mounted at
 * `/api/v1/workspaces/:workspaceId/intelligence` (mergeParams) AFTER `authenticate` +
 * `requireWorkspaceRole('MEMBER')` at the mount point (see v1.ts) and the intelligence limiter.
 *
 * Everything here is a READ of signals derived on demand from data the caller can already see (the
 * orchestrator re-checks project visibility per `:projectId`), plus the caller's own dismissal writes.
 * No task / decision / project mutation is ever reachable through this router (Phase 7 §E/§13).
 */
export const intelligenceRouter = Router({ mergeParams: true });

// Project intelligence overview + individual slices.
intelligenceRouter.get(
  '/projects/:projectId/overview',
  validateQuery(intelligenceQuerySchema),
  controller.overview,
);
intelligenceRouter.get(
  '/projects/:projectId/health',
  validateQuery(intelligenceQuerySchema),
  controller.health,
);
intelligenceRouter.get(
  '/projects/:projectId/blockers',
  validateQuery(intelligenceQuerySchema),
  controller.blockers,
);
intelligenceRouter.get(
  '/projects/:projectId/risks',
  validateQuery(intelligenceQuerySchema),
  controller.risks,
);
intelligenceRouter.get(
  '/projects/:projectId/recommendations',
  validateQuery(intelligenceQuerySchema),
  controller.recommendations,
);
intelligenceRouter.get(
  '/projects/:projectId/decision-impacts',
  validateQuery(intelligenceQuerySchema),
  controller.decisionImpacts,
);

// Personal execution intelligence (My Work aggregate, visibility-filtered).
intelligenceRouter.get('/personal', validateQuery(intelligenceQuerySchema), controller.personal);

// The caller's own signal dismissals (per workspace + user).
intelligenceRouter.post('/dismissals', validate(createDismissalSchema), controller.dismiss);
intelligenceRouter.delete('/dismissals', validate(deleteDismissalSchema), controller.undismiss);
