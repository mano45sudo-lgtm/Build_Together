import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { chatLimiter } from '../../middlewares/rate-limit.js';
import { validate } from '../../middlewares/validate.js';
import { requireWorkspaceRole } from '../../middlewares/workspace-scope.js';
import {
  addConversationMembersSchema,
  createConversationSchema,
} from '../../validation/schemas.js';
import * as controller from './chat.controller.js';

/**
 * Workspace-scoped chat routes. Mounted at `/api/v1/workspaces/:workspaceId` (mergeParams), so every
 * `:workspaceId` route runs `requireWorkspaceRole` FIRST — membership is re-checked against the DB, and
 * a non-member of the path workspace is rejected before any conversation logic runs. Conversation
 * authorization (participant/creator) is layered on top in the service. The conversation id is ALWAYS
 * validated to belong to the same workspace id in the path — cross-workspace id manipulation → 404.
 */
export const chatRouter = Router({ mergeParams: true });

// Client token (short-lived, user-scoped; minted only for a verified workspace member).
chatRouter.get(
  '/chat/token',
  authenticate,
  requireWorkspaceRole('MEMBER'),
  chatLimiter,
  controller.getToken,
);

// Conversation collection.
chatRouter.get(
  '/conversations',
  authenticate,
  requireWorkspaceRole('MEMBER'),
  controller.listConversations,
);
chatRouter.post(
  '/conversations',
  authenticate,
  requireWorkspaceRole('MEMBER'),
  chatLimiter,
  validate(createConversationSchema),
  controller.createConversation,
);

// Single conversation + membership.
chatRouter.get(
  '/conversations/:conversationId',
  authenticate,
  requireWorkspaceRole('MEMBER'),
  controller.getConversation,
);
chatRouter.post(
  '/conversations/:conversationId/members',
  authenticate,
  requireWorkspaceRole('MEMBER'),
  chatLimiter,
  validate(addConversationMembersSchema),
  controller.addMembers,
);
chatRouter.delete(
  '/conversations/:conversationId/members/:userId',
  authenticate,
  requireWorkspaceRole('MEMBER'),
  controller.removeMember,
);

/**
 * Provider server callbacks — mounted at `/api/v1/webhooks` (NOT under a workspace; the workspace is
 * implied by the event). Unauthenticated by design: authenticity comes from the App-Secret signature.
 */
export const chatWebhookRouter = Router();
chatWebhookRouter.post('/nexconn', controller.receiveWebhook);
