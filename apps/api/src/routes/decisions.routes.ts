import { Router } from 'express';
import { validate, validateQuery } from '../middlewares/validate.js';
import {
  createDecisionCommentSchema,
  createDecisionSchema,
  decisionListQuerySchema,
  decisionFeedQuerySchema,
  decisionParticipantSchema,
  supersedeDecisionSchema,
  updateDecisionSchema,
} from '../validation/decisions.schemas.js';
import * as controller from '../controllers/decisions.controller.js';

/**
 * Decision Vault routes, mounted at `/api/v1/workspaces/:workspaceId/decisions` (mergeParams) AFTER
 * `authenticate` + `requireWorkspaceRole('MEMBER')` are applied at the mount point (see v1.ts). Every
 * request is already a verified member of the PATH workspace, and every `:decisionId` is resolved
 * against that workspace server-side (a foreign id reads as 404). The decision SERVICE adds the
 * project-visibility/management rules and the lifecycle legality on top.
 */
export const decisionsRouter = Router({ mergeParams: true });

// Collection.
decisionsRouter.get('/', validateQuery(decisionListQuerySchema), controller.list);
decisionsRouter.post('/', validate(createDecisionSchema), controller.create);

// Single decision + content updates.
decisionsRouter.get('/:decisionId', controller.get);
decisionsRouter.patch('/:decisionId', validate(updateDecisionSchema), controller.update);
decisionsRouter.delete('/:decisionId', controller.remove);

// Lifecycle (dedicated endpoints so the history stays typed; PATCH cannot reach these states).
decisionsRouter.post('/:decisionId/finalize', controller.finalize);
decisionsRouter.post('/:decisionId/supersede', validate(supersedeDecisionSchema), controller.supersede);
decisionsRouter.post('/:decisionId/archive', controller.archive);
decisionsRouter.post('/:decisionId/restore', controller.restore);

// Participants (roster management is an editor action; the creator is immovable).
decisionsRouter.post(
  '/:decisionId/participants',
  validate(decisionParticipantSchema),
  controller.addParticipant,
);
decisionsRouter.delete('/:decisionId/participants/:userId', controller.removeParticipant);

// History timeline + discussion comments (both paginated feeds).
decisionsRouter.get('/:decisionId/history', validateQuery(decisionFeedQuerySchema), controller.history);
decisionsRouter.get(
  '/:decisionId/comments',
  validateQuery(decisionFeedQuerySchema),
  controller.listComments,
);
decisionsRouter.post(
  '/:decisionId/comments',
  validate(createDecisionCommentSchema),
  controller.addComment,
);
decisionsRouter.delete('/:decisionId/comments/:commentId', controller.deleteComment);
