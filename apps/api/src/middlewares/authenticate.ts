import type { NextFunction, Request, Response } from 'express';
import { unauthorized } from '../errors/app-error.js';
import * as sessionRepo from '../repositories/session.repo.js';
import type { AuthContext } from '../types/auth.js';

/**
 * Authenticates a request from its `Authorization: Bearer <raw-access-token>` header.
 *
 * The token is a high-entropy opaque string; the server stores only its SHA-256 hash (ADR-0003),
 * resolved here via the session repository (never Prisma directly from middleware). We reject if
 * the session was revoked, has expired, or belongs to a disabled account. On success we attach
 * `{ userId, sessionId }` to `req.auth` — identifiers only, never the token. There is no cookie
 * session, so CSRF is not applicable; the `Authorization` header is itself the CSRF defence (a
 * cross-site form cannot set it).
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

    const session = await sessionRepo.findSessionByAccessHash(raw);
    if (!session || session.revokedAt !== null) {
      throw unauthorized('INVALID_SESSION', 'Session is invalid or revoked');
    }
    if (session.accessExpiresAt.getTime() <= Date.now()) {
      throw unauthorized('SESSION_EXPIRED', 'Session has expired');
    }
    if (session.user.status !== 'ACTIVE') {
      throw unauthorized('ACCOUNT_DISABLED', 'Account is disabled');
    }

    const auth: AuthContext = { userId: session.userId, sessionId: session.id };
    req.auth = auth;
    next();
  } catch (err) {
    next(err);
  }
}
