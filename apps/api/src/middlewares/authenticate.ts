import type { NextFunction, Request, Response } from 'express';
import { unauthorized } from '../errors/app-error.js';
import { getClerkVerifier } from '../lib/clerk.js';
import { resolveInternalIdentity } from '../services/identity.service.js';
import type { AuthContext } from '../types/auth.js';

/**
 * Authenticates a request from its `Authorization: Bearer <clerk-session-token>` header (ADR-0006).
 *
 * Clerk is the authentication authority; this middleware is the API's single trust boundary. It
 * (1) cryptographically verifies the Clerk session token via the supported Backend SDK — never a
 * hand-decoded JWT — then (2) maps the verified Clerk user id (`sub`) onto Cue's internal identity,
 * provisioning a first-timer. It attaches ONLY `{ userId, sessionId }` (internal id + Clerk `sid`)
 * to `req.auth` — never the raw token or any client-asserted id. There is no cookie session, so the
 * `Authorization` header is itself the CSRF defence. Authorization (workspace roles, membership) is
 * resolved separately and later by `requireWorkspaceRole`; nothing here trusts a body/query id.
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

    const verified = await getClerkVerifier()(raw);
    const user = await resolveInternalIdentity(verified.clerkUserId);

    const auth: AuthContext = { userId: user.id, sessionId: verified.sessionId };
    req.auth = auth;
    next();
  } catch (err) {
    next(err);
  }
}
