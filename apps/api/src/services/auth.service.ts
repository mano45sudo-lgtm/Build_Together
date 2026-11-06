import type { AuthSessionView } from '@buildtogether/shared';
import { unauthorized } from '../errors/app-error.js';
import { buildSessionView } from '../lib/view.js';
import * as userRepo from '../repositories/user.repo.js';
import * as workspaceRepo from '../repositories/workspace.repo.js';

/**
 * Authentication-adjacent business logic (ADR-0006). Credential flows (sign up / sign in / refresh
 * / password reset) are now owned by Clerk and no longer live here — the API only VERIFIES Clerk
 * session tokens (see `middlewares/authenticate.ts`) and maps them onto internal identities (see
 * `services/identity.service.ts`). What remains is the generic, information-safe read of the current
 * session view for an already-authenticated user. It never touches HTTP or returns any secret.
 */

/** Non-secret request context captured for auditing (device binding / forensics). */
export interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

/** Resolve the current session view for an authenticated user (no tokens — Clerk holds the session). */
export async function currentSession(userId: string): Promise<AuthSessionView> {
  const user = await userRepo.findUserById(userId);
  if (!user) throw unauthorized('INVALID_SESSION', 'Session is no longer valid');
  const memberships = await workspaceRepo.listMembershipsForUser(userId);
  return buildSessionView(user, memberships);
}
