import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  AuthSessionView,
  LoginInput,
  RegisterInput,
  WorkspaceSummary,
} from '@buildtogether/shared';
import { hasBridge, requireBridge, unwrap } from '../lib/bridge';

/**
 * Client mirror of the authenticated session. It holds only what the main process is willing to
 * share — the sanitized `AuthSessionView` (user + workspaces) — never a token. On launch it asks the
 * main process for the current session (`me`), which transparently restores a persisted desktop
 * session. The "active workspace" is a UI selection; every workspace-scoped call still carries the
 * id and is re-authorized server-side, so switching is never a client-only illusion of scope.
 */

export type AuthStatus = 'checking' | 'signed-out' | 'signed-in';

interface AuthContextValue {
  status: AuthStatus;
  session: AuthSessionView | null;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceSummary | null;
  setActiveWorkspaceId: (id: string) => void;
  signUp: (input: RegisterInput) => Promise<void>;
  signIn: (input: LoginInput) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-pull the session view (after a workspace/membership change). */
  refresh: () => Promise<void>;
  /** Adopt a session view already returned by an action (register/login). */
  applySession: (session: AuthSessionView) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function pickActiveId(session: AuthSessionView, current: string | null): string | null {
  if (current && session.workspaces.some((w) => w.id === current)) return current;
  return session.workspaces[0]?.id ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [session, setSession] = useState<AuthSessionView | null>(null);
  const [activeWorkspaceId, setActiveId] = useState<string | null>(null);

  const applySession = useCallback((next: AuthSessionView) => {
    setSession(next);
    setActiveId((current) => pickActiveId(next, current));
    setStatus('signed-in');
  }, []);

  const loadSession = useCallback(async () => {
    if (!hasBridge()) {
      setStatus('signed-out');
      return;
    }
    const bridge = requireBridge();
    const view = await unwrap(bridge.auth.me());
    if (view) applySession(view);
    else {
      setSession(null);
      setActiveId(null);
      setStatus('signed-out');
    }
  }, [applySession]);

  useEffect(() => {
    void loadSession().catch(() => setStatus('signed-out'));
  }, [loadSession]);

  const signUp = useCallback(
    async (input: RegisterInput) => {
      const bridge = requireBridge();
      applySession(await unwrap(bridge.auth.register(input)));
    },
    [applySession],
  );

  const signIn = useCallback(
    async (input: LoginInput) => {
      const bridge = requireBridge();
      applySession(await unwrap(bridge.auth.login(input)));
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    const bridge = requireBridge();
    await unwrap(bridge.auth.logout());
    setSession(null);
    setActiveId(null);
    setStatus('signed-out');
  }, []);

  const refresh = useCallback(async () => {
    const bridge = requireBridge();
    const view = await unwrap(bridge.auth.me());
    if (view) applySession(view);
    else {
      setSession(null);
      setActiveId(null);
      setStatus('signed-out');
    }
  }, [applySession]);

  const value = useMemo<AuthContextValue>(() => {
    const activeWorkspace = session?.workspaces.find((w) => w.id === activeWorkspaceId) ?? null;
    return {
      status,
      session,
      workspaces: session?.workspaces ?? [],
      activeWorkspaceId,
      activeWorkspace,
      setActiveWorkspaceId: setActiveId,
      signUp,
      signIn,
      signOut,
      refresh,
      applySession,
    };
  }, [status, session, activeWorkspaceId, signUp, signIn, signOut, refresh, applySession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
