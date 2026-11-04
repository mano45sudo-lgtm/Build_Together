import type { WorkspaceRole } from '@buildtogether/shared';

/**
 * Authentication context attached to a request by the `authenticate` middleware after it
 * resolves the bearer access token to a valid, live server-side session (see ADR-0003).
 * It carries only identifiers — never the raw token or the password hash.
 */
export interface AuthContext {
  userId: string;
  sessionId: string;
}

/** Workspace context attached by `requireWorkspaceRole` after a server-side membership check. */
export interface WorkspaceContext {
  workspaceId: string;
  /** The requesting user's resolved role in this workspace. */
  role: WorkspaceRole;
}

// Module augmentation so `req.auth` / `req.requestId` / `req.workspace` are typed everywhere.
declare global {
  // Express's request augmentation requires a namespace; there is no ES-module equivalent.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      requestId?: string;
      workspace?: WorkspaceContext;
      /** Parsed, validated query params attached by `validateQuery` (controllers narrow the type). */
      validatedQuery?: unknown;
    }
  }
}
