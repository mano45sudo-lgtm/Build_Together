import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth as useClerkAuth } from '@clerk/electron/react';
import type { AuthSessionView, WorkspaceSummary } from '@buildtogether/shared';
import { BridgeError, errorMessage, hasBridge, requireBridge, unwrap } from '../lib/bridge';

/**
 * Client mirror of the authenticated session — but Clerk owns authentication (ADR-0006), so this
 * provider no longer mints or stores credentials. It reacts to Clerk's auth state (via the
 * `@clerk/electron/react` `useAuth` hook) and keeps the trusted main process in sync:
 *
 *   1. On sign-in we pull a SHORT-LIVED Clerk session JWT with `getToken()` and push it to main over
 *      `auth.syncToken`. Main is the sole authenticated API caller and holds that JWT only in memory.
 *   2. We then ask main for the sanitized `me` view (user + workspaces) — the server verifies the JWT
 *      and resolves the internal identity, so the client never trusts a locally-fabricated session.
 *   3. A keepalive re-pushes a freshly-refreshed `getToken()` on an interval so main's bearer never goes
 *      stale mid-session (Clerk rotates session tokens automatically; we just ferry them over).
 *   4. On sign-out (or a rejected token) we clear main's holder and drop to the signed-out state.
 *
 * The "active workspace" is a pure UI selection; every workspace-scoped call still carries the id and
 * is re-authorized server-side, so switching is never a client-only illusion of scope. Sign up/in,
 * email verification, and password reset are driven directly by Clerk hooks in `WelcomeScreen`, NOT here.
 */

export type AuthStatus = 'checking' | 'signed-out' | 'signed-in' | 'error';

interface AuthContextValue {
  status: AuthStatus;
  /** Clerk initialization is independent from BuildTogether's API session lookup. */
  clerkLoaded: boolean;
  authError: string | null;
  session: AuthSessionView | null;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceSummary | null;
  setActiveWorkspaceId: (id: string) => void;
  signOut: () => Promise<void>;
  /** Re-pull the session view (after a workspace/membership change). */
  refresh: () => Promise<void>;
  retryAuth: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** How often we ferry a freshly-refreshed Clerk session token to main (ms). Well under the ~60s TTL. */
const TOKEN_KEEPALIVE_MS = 45_000;
const AUTH_HANDOFF_TIMEOUT_MS = 20_000;
const API_RETRY_DELAYS_MS = [300, 700, 1_400] as const;

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function loadSessionWithRetry(
  bridge: ReturnType<typeof requireBridge>,
): Promise<AuthSessionView | null> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await unwrap(bridge.auth.me());
    } catch (error) {
      const delay = API_RETRY_DELAYS_MS[attempt];
      if (
        !(error instanceof BridgeError) ||
        error.code !== 'NETWORK_ERROR' ||
        delay === undefined
      ) {
        throw error;
      }
      await wait(delay);
    }
  }
}

/**
 * Right after an OAuth callback Clerk can report `isSignedIn` a beat before `getToken()` returns a
 * session JWT. Retry briefly instead of treating that gap as a sign-out, which would strand a signed-in
 * user on the sign-in screen with nothing left to re-trigger the handoff.
 */
async function getTokenWithRetry(getToken: () => Promise<string | null>): Promise<string | null> {
  for (let attempt = 0; ; attempt += 1) {
    const token = await getToken();
    const delay = API_RETRY_DELAYS_MS[attempt];
    if (token || delay === undefined) return token;
    await wait(delay);
  }
}

function authFailureMessage(error: unknown): string {
  if (error instanceof BridgeError && error.code === 'AUTH_NOT_CONFIGURED') {
    return 'The API is missing its Clerk server key. Set CLERK_SECRET_KEY in apps/api/.env and restart the API.';
  }
  if (error instanceof BridgeError && error.code === 'NETWORK_ERROR') {
    return 'Cue could not connect to its API. Confirm the API is running, then try again.';
  }
  return errorMessage(error);
}

function pickActiveId(session: AuthSessionView, current: string | null): string | null {
  if (current && session.workspaces.some((w) => w.id === current)) return current;
  return session.workspaces[0]?.id ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken, signOut: clerkSignOut } = useClerkAuth();

  const [status, setStatus] = useState<AuthStatus>('checking');
  const [session, setSession] = useState<AuthSessionView | null>(null);
  const [activeWorkspaceId, setActiveId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const applySession = useCallback((next: AuthSessionView) => {
    setSession(next);
    setActiveId((current) => pickActiveId(next, current));
    setStatus('signed-in');
  }, []);

  const clearSession = useCallback((nextStatus: AuthStatus) => {
    setSession(null);
    setActiveId(null);
    setAuthError(null);
    setStatus(nextStatus);
  }, []);

  const retryAuth = useCallback(() => setRetryCount((count) => count + 1), []);

  // React to Clerk's auth state: sync the token to main and resolve the sanitized `me` view.
  useEffect(() => {
    if (!isLoaded) {
      setSession(null);
      setActiveId(null);
      setAuthError(null);
      setStatus('checking');
      const timeout = window.setTimeout(() => {
        setAuthError('Clerk is taking longer than expected to restore your session.');
        setStatus('error');
      }, AUTH_HANDOFF_TIMEOUT_MS);
      return () => window.clearTimeout(timeout);
    }

    // Signed out in Clerk — make sure main isn't holding a stale token either.
    if (!isSignedIn) {
      if (hasBridge()) void unwrap(requireBridge().auth.syncToken(null)).catch(() => undefined);
      clearSession('signed-out');
      return;
    }

    let cancelled = false;
    let timedOut = false;
    setStatus('checking');
    setAuthError(null);
    const timeout = window.setTimeout(() => {
      timedOut = true;
      setAuthError(
        'Finishing sign-in is taking longer than expected. Check your connection and try again.',
      );
      setStatus('error');
    }, AUTH_HANDOFF_TIMEOUT_MS);
    void (async () => {
      try {
        if (!hasBridge()) {
          clearSession('signed-out');
          return;
        }
        const bridge = requireBridge();
        const token = await getTokenWithRetry(getToken);
        if (cancelled || timedOut) return;
        // Clerk says signed-in but never issued a token: surface a recoverable error (Try again /
        // Return to sign in) rather than a sign-in form that cannot complete.
        if (!token) {
          setAuthError('Your sign-in did not finish. Try again, or return to sign in.');
          setStatus('error');
          return;
        }
        await unwrap(bridge.auth.syncToken(token));
        if (cancelled || timedOut) return;
        const view = await loadSessionWithRetry(bridge);
        if (cancelled || timedOut) return;
        if (view) applySession(view);
        else clearSession('signed-out');
      } catch (error) {
        if (!cancelled && !timedOut) {
          setAuthError(authFailureMessage(error));
          setStatus('error');
        }
      } finally {
        window.clearTimeout(timeout);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [isLoaded, isSignedIn, userId, getToken, retryCount, applySession, clearSession]);

  // Keep main's bearer fresh for the duration of the session. Clerk auto-refreshes the underlying
  // session token; we re-fetch and re-push it periodically so a long-lived desktop session never lets
  // the value main holds expire between explicit `me` pulls.
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !hasBridge()) return;
    const id = setInterval(() => {
      void (async () => {
        try {
          const token = await getToken();
          await unwrap(requireBridge().auth.syncToken(token));
        } catch {
          // Transient (offline / brief refresh failure): the next tick or a Clerk state change recovers.
        }
      })();
    }, TOKEN_KEEPALIVE_MS);
    return () => clearInterval(id);
  }, [isLoaded, isSignedIn, getToken]);

  const signOut = useCallback(async () => {
    // Clear main's holder first so no in-flight API call races a torn-down session, then let Clerk end
    // its own session (which also clears the encrypted client token Clerk persists on disk).
    if (hasBridge()) await unwrap(requireBridge().auth.syncToken(null)).catch(() => undefined);
    clearSession('signed-out');
    try {
      await clerkSignOut();
    } catch (error) {
      // Clerk still holds the session, so showing the sign-in form would be a lie. Re-run the
      // handoff so the UI reflects Clerk's real state.
      console.warn('[desktop] Clerk sign-out failed', error);
      retryAuth();
    }
  }, [clerkSignOut, clearSession, retryAuth]);

  const refresh = useCallback(async () => {
    if (!hasBridge()) return;
    const view = await unwrap(requireBridge().auth.me());
    if (view) applySession(view);
    else clearSession('signed-out');
  }, [applySession, clearSession]);

  const value = useMemo<AuthContextValue>(() => {
    const activeWorkspace = session?.workspaces.find((w) => w.id === activeWorkspaceId) ?? null;
    return {
      status,
      clerkLoaded: isLoaded,
      authError,
      session,
      workspaces: session?.workspaces ?? [],
      activeWorkspaceId,
      activeWorkspace,
      setActiveWorkspaceId: setActiveId,
      signOut,
      refresh,
      retryAuth,
    };
  }, [status, authError, session, activeWorkspaceId, signOut, refresh, retryAuth]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
