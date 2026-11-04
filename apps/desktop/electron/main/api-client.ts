import type {
  AcceptInvitationInput,
  ApiResponse,
  AuthSessionView,
  ChangePasswordInput,
  CreateInvitationInput,
  CreateWorkspaceInput,
  CreatedInvitation,
  InvitationSummary,
  IssuedSession,
  LoginInput,
  MemberSummary,
  PublicUser,
  RegisterInput,
  UpdateProfileInput,
  UpdateWorkspaceInput,
  WorkspaceRole,
  WorkspaceSummary,
} from '@buildtogether/shared';
import { resolveApiBaseUrl } from './config';
import { getTokens, setTokens } from './session-store';
import type { StoredTokens } from './session-store';

/**
 * The trusted main-process API client (ADR-0003 §4, §11). This is the ONLY place that talks to
 * the BuildTogether API for authenticated operations: it attaches the bearer access token from the
 * session store and, on a `401`, transparently refreshes the session ONCE (rotating the refresh
 * token) before replaying the request. If the refresh itself fails the session is cleared, so a
 * stolen/expired session cannot silently linger.
 *
 * Tokens are mapped to the store here and are NEVER returned to the renderer — callers get only the
 * sanitized view (`AuthSessionView` / domain DTOs). Network + API failures surface as `ApiRequestError`
 * so the IPC layer can translate them into the safe `IpcOutcome` envelope.
 */

export class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const V1 = '/api/v1';

function toStoredTokens(issued: IssuedSession): StoredTokens {
  return {
    accessToken: issued.tokens.accessToken,
    refreshToken: issued.tokens.refreshToken,
    accessExpiresAt: issued.tokens.accessExpiresAt,
    refreshExpiresAt: issued.tokens.refreshExpiresAt,
  };
}

/** Low-level fetch that never throws on a bad HTTP status — returns status + parsed envelope. */
async function call(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; env: ApiResponse<unknown> }> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;

  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  let res: Response;
  try {
    res = await fetch(resolveApiBaseUrl() + path, init);
  } catch (error) {
    throw new ApiRequestError(
      'NETWORK_ERROR',
      error instanceof Error ? error.message : 'Network request failed',
    );
  }

  const env = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
  return {
    status: res.status,
    env: env ?? {
      data: null,
      error: { code: 'EMPTY_RESPONSE', message: 'Empty response from API' },
    },
  };
}

/** Refresh the stored session using the refresh token; returns false if rotation failed. */
async function refreshSession(): Promise<boolean> {
  const tokens = getTokens();
  if (!tokens) return false;
  const { env } = await call('POST', `${V1}/auth/refresh`, { refreshToken: tokens.refreshToken });
  if (env.error || !env.data) {
    await setTokens(null);
    return false;
  }
  await setTokens(toStoredTokens(env.data as IssuedSession));
  return true;
}

/** Unauthenticated POST used by the credential endpoints (register/login) that return a token pair. */
async function issueSession(path: string, body: unknown): Promise<AuthSessionView> {
  const { status, env } = await call('POST', path, body);
  if (env.error || !env.data) throw toError(status, env);
  const issued = env.data as IssuedSession;
  await setTokens(toStoredTokens(issued));
  return issued.session;
}

function toError(status: number, env: ApiResponse<unknown>): ApiRequestError {
  if (env.error) return new ApiRequestError(env.error.code, env.error.message, env.error.details);
  return new ApiRequestError('REQUEST_FAILED', `Request failed (${status})`);
}

/**
 * Authenticated request: attach the access token; on a `401` refresh once and replay; otherwise
 * return the typed `data` or throw. This is the single choke point that guarantees the server —
 * not the client — is the authority on session validity.
 */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const tokens = getTokens();
  if (!tokens) throw new ApiRequestError('UNAUTHENTICATED', 'You are not signed in');

  let { status, env } = await call(method, path, body, tokens.accessToken);

  if (status === 401 && (await refreshSession())) {
    const next = getTokens();
    if (next) ({ status, env } = await call(method, path, body, next.accessToken));
  }

  if (env.error || env.data === null) throw toError(status, env);
  return env.data as T;
}

// ---- Auth ----

export const auth = {
  register: (input: RegisterInput): Promise<AuthSessionView> =>
    issueSession(`${V1}/auth/register`, input),
  login: (input: LoginInput): Promise<AuthSessionView> => issueSession(`${V1}/auth/login`, input),
  async logout(): Promise<null> {
    const tokens = getTokens();
    if (tokens) {
      // Best-effort server revoke with the CURRENT access token; ignore auth failures — we clear locally regardless.
      await call(
        'POST',
        `${V1}/auth/logout`,
        { refreshToken: tokens.refreshToken },
        tokens.accessToken,
      ).catch(() => undefined);
    }
    await setTokens(null);
    return null;
  },
  async me(): Promise<AuthSessionView | null> {
    if (!getTokens()) return null;
    try {
      return await request<AuthSessionView>('GET', `${V1}/auth/me`);
    } catch (error) {
      // A dead session after failed refresh means signed out.
      if (
        error instanceof ApiRequestError &&
        (error.code === 'UNAUTHENTICATED' || error.code === 'INVALID_SESSION')
      ) {
        return null;
      }
      throw error;
    }
  },
  async changePassword(input: ChangePasswordInput): Promise<null> {
    const tokens = getTokens();
    if (!tokens) throw new ApiRequestError('UNAUTHENTICATED', 'You are not signed in');
    const { status, env } = await call(
      'POST',
      `${V1}/auth/change-password`,
      input,
      tokens.accessToken,
    );
    if (env.error || !env.data) throw toError(status, env);
    // Password change rotates the acting session — adopt the new token pair.
    await setTokens(toStoredTokens(env.data as IssuedSession));
    return null;
  },
};

// ---- Users ----

export const users = {
  updateMe: (input: UpdateProfileInput): Promise<PublicUser> =>
    request<PublicUser>('PATCH', `${V1}/users/me`, input),
};

// ---- Workspaces ----

export const workspaces = {
  list: (): Promise<WorkspaceSummary[]> => request<WorkspaceSummary[]>('GET', `${V1}/workspaces`),
  create: (input: CreateWorkspaceInput): Promise<WorkspaceSummary> =>
    request<WorkspaceSummary>('POST', `${V1}/workspaces`, input),
  get: (workspaceId: string): Promise<WorkspaceSummary> =>
    request<WorkspaceSummary>('GET', `${V1}/workspaces/${workspaceId}`),
  update: (workspaceId: string, input: UpdateWorkspaceInput): Promise<WorkspaceSummary> =>
    request<WorkspaceSummary>('PATCH', `${V1}/workspaces/${workspaceId}`, input),
};

// ---- Members ----

export const members = {
  list: (workspaceId: string): Promise<MemberSummary[]> =>
    request<MemberSummary[]>('GET', `${V1}/workspaces/${workspaceId}/members`),
  updateRole: (workspaceId: string, memberId: string, role: WorkspaceRole): Promise<null> =>
    request<null>('PATCH', `${V1}/workspaces/${workspaceId}/members/${memberId}`, { role }),
  remove: (workspaceId: string, memberId: string): Promise<null> =>
    request<null>('DELETE', `${V1}/workspaces/${workspaceId}/members/${memberId}`),
  transfer: (workspaceId: string, memberId: string): Promise<null> =>
    request<null>('POST', `${V1}/workspaces/${workspaceId}/members/${memberId}/transfer`),
};

// ---- Invitations ----

export const invitations = {
  create: (workspaceId: string, input: CreateInvitationInput): Promise<CreatedInvitation> =>
    request<CreatedInvitation>('POST', `${V1}/workspaces/${workspaceId}/invitations`, input),
  list: (workspaceId: string): Promise<InvitationSummary[]> =>
    request<InvitationSummary[]>('GET', `${V1}/workspaces/${workspaceId}/invitations`),
  revoke: (workspaceId: string, invitationId: string): Promise<null> =>
    request<null>('DELETE', `${V1}/workspaces/${workspaceId}/invitations/${invitationId}`),
  accept: (input: AcceptInvitationInput): Promise<WorkspaceSummary> =>
    request<WorkspaceSummary>('POST', `${V1}/invitations/accept`, input),
  pendingForMe: (): Promise<InvitationSummary[]> =>
    request<InvitationSummary[]>('GET', `${V1}/invitations/pending`),
};
