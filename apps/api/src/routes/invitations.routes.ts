import { Router } from 'express';
import * as controller from '../controllers/invitations.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authLimiter } from '../middlewares/rate-limit.js';
import { validate } from '../middlewares/validate.js';
import { acceptInvitationSchema } from '../validation/schemas.js';

/**
 * Non-workspace-scoped invitation routes (mounted at `/api/v1/invitations`). `accept` is proven by
 * the invitation token and the acceptor's authenticated identity (email must match) — rate-limited
 * as an extra guard; `pending` lists invitations addressed to the caller's own email.
 */
export const invitationsRouter = Router();

invitationsRouter.post(
  '/accept',
  authenticate,
  authLimiter,
  validate(acceptInvitationSchema),
  controller.accept,
);
invitationsRouter.get('/pending', authenticate, controller.pendingForMe);
