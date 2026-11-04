import { Router } from 'express';
import * as controller from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authLimiter } from '../middlewares/rate-limit.js';
import { validate } from '../middlewares/validate.js';
import {
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
} from '../validation/schemas.js';

/**
 * Auth routes (mounted at `/api/v1/auth`). Credential endpoints are rate-limited for brute-force
 * resistance. `logout` needs no `authenticate` — it is proven by the refresh token in the body, so
 * an already-expired access token can still sign out cleanly. `me` returns the session view only.
 */
export const authRouter = Router();

authRouter.post('/register', authLimiter, validate(registerSchema), controller.register);
authRouter.post('/login', authLimiter, validate(loginSchema), controller.login);
authRouter.post('/refresh', authLimiter, validate(refreshSchema), controller.refresh);
authRouter.post('/logout', validate(refreshSchema), controller.logout);
authRouter.get('/me', authenticate, controller.me);
authRouter.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  controller.changePassword,
);
