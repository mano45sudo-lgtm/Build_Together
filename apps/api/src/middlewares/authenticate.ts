import type { NextFunction, Request, Response } from 'express';
import { unauthorized } from '../errors/app-error.js';
import { getClerkApiKeyVerifier, getClerkVerifier } from '../lib/clerk.js';
import { resolveInternalIdentity } from '../services/identity.service.js';
import type { AuthContext } from '../types/auth.js';

/**
 * Read-only routes a Clerk API key may call (the local MCP integration): list workspaces and
 * projects, a project's intelligence overview, and the caller's personal focus. GET only.
 */
const API_KEY_ROUTES =
  /^\/api\/v1\/workspaces(?:\/[^/]+\/(?:projects|intelligence\/projects\/[^/]+\/overview|intelligence\/personal))?\/?$/;

/** True when an API key may be used for this request (exported for tests). */
export function apiKeyMayAccess(method: string, originalUrl: string): boolean {
  return method === 'GET' && API_KEY_ROUTES.test(originalUrl.split('?')[0] ?? '');
}

/**
 * Authenticates a request from its `Authorization: Bearer <token>` header (ADR-0006).
 *
 * Clerk is the authentication authority; this middleware is the API's single trust boundary. A Clerk
 * session token (a JWT) is verified with the Backend SDK — never hand-decoded. Any other bearer value
 * is treated as a user's Clerk API key and is accepted ONLY on the read-only routes above. Either way
 * the verified Clerk user id maps onto Cue's internal identity, and only `{ userId, sessionId }` is
 * attached to `req.auth`. Workspace authorization still runs later in `requireWorkspaceRole`.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.header('authorization');
    const raw = header?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!raw) throw unauthorized('UNAUTHENTICATED', 'Authentication required');

    let clerkUserId: string;
    let sessionId: string;
    if (raw.split('.').length === 3) {
      ({ clerkUserId, sessionId } = await getClerkVerifier()(raw));
    } else {
      // Outside the read-only routes a non-JWT bearer is simply an invalid session (unchanged 401).
      if (!apiKeyMayAccess(req.method, req.originalUrl)) {
        throw unauthorized('INVALID_SESSION', 'Session is invalid or expired');
      }
      const key = await getClerkApiKeyVerifier()(raw);
      clerkUserId = key.clerkUserId;
      sessionId = `apikey:${key.keyId}`;
    }

    const user = await resolveInternalIdentity(clerkUserId);
    const auth: AuthContext = { userId: user.id, sessionId };
    req.auth = auth;
    next();
  } catch (err) {
    next(err);
  }
}
