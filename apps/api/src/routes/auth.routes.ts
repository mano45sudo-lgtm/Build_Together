import { Router } from 'express';
import * as controller from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/authenticate.js';

/**
 * Auth routes (mounted at `/api/v1/auth`). Clerk owns sign up/in, refresh, and password reset, so
 * there are no credential endpoints here (ADR-0006). `me` returns the current session view only,
 * after `authenticate` has verified the Clerk session token and resolved the internal identity.
 */
export const authRouter = Router();

authRouter.get('/me', authenticate, controller.me);
