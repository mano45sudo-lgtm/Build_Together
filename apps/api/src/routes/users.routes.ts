import { Router } from 'express';
import * as controller from '../controllers/users.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import { updateProfileSchema } from '../validation/schemas.js';

/**
 * User-profile routes (mounted at `/api/v1/users`). Both are self-scoped to the authenticated user
 * (`/me`); there is no arbitrary-user read/update in Phase 2.
 */
export const usersRouter = Router();

usersRouter.get('/me', authenticate, controller.getMe);
usersRouter.patch('/me', authenticate, validate(updateProfileSchema), controller.updateMe);
