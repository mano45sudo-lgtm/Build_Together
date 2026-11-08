import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AuthSessionView, DesktopBridge, IpcOutcome } from '@buildtogether/shared';
import { AuthProvider, useAuth } from '../state/AuthProvider';
import { setClerkIssuesToken, signInAsClerk, signOutFromClerk } from './clerk';

/**
 * AuthProvider session handling (the account chooser itself is covered in auth-screen.test.tsx):
 *  - happy: sign in → out → in as another account re-syncs main with the new identity's token and
 *    session view.
 *  - error: Clerk signed-in without a token is a recoverable error, not a dead sign-in form.
 *  - edge: a failed Clerk sign-out re-syncs instead of showing a sign-in form over a live session.
 */

const ok = <T,>(data: T): Promise<IpcOutcome<T>> => Promise.resolve({ ok: true, data });

function sessionFor(userId: string, name: string): AuthSessionView {
  return {
    user: {
      id: userId,
      name,
      email: `${userId}@example.com`,
      avatarUrl: null,
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    workspaces: [],
  };
}

const SESSIONS: Record<string, AuthSessionView> = {
  user_a: sessionFor('user_a', 'Account A'),
  user_b: sessionFor('user_b', 'Account B'),
};

function installAuthBridge() {
  let held: string | null = null;
  const syncToken = vi.fn((token: string | null) => {
    held = token;
    return ok(null);
  });
  // Mirrors the API: `me` resolves whichever identity the currently-held token belongs to.
  const me = vi.fn(() => ok(held ? (SESSIONS[held.replace('test-jwt-', '')] ?? null) : null));
  Object.defineProperty(window, 'bt', {
    value: { auth: { syncToken, me } } as unknown as DesktopBridge,
    configurable: true,
    writable: true,
  });
  return { syncToken, me };
}

function Probe() {
  const { status, session, authError, signOut } = useAuth();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="user">{session?.user.name ?? ''}</p>
      <p data-testid="error">{authError ?? ''}</p>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}

function renderProbe() {
  const utils = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  return {
    ...utils,
    rerenderProbe: () =>
      utils.rerender(
        <AuthProvider>
          <Probe />
        </AuthProvider>,
      ),
  };
}

afterEach(() => {
  Object.defineProperty(window, 'bt', { value: undefined, configurable: true, writable: true });
  vi.restoreAllMocks();
});

describe('AuthProvider session handling', () => {
  it('signs out and signs back in as a different account with a fresh token and session', async () => {
    const { syncToken } = installAuthBridge();
    signInAsClerk('user_a');
    const { rerenderProbe } = renderProbe();
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Account A'));
    expect(syncToken).toHaveBeenLastCalledWith('test-jwt-user_a');

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-out'));
    expect(syncToken).toHaveBeenCalledWith(null);
    rerenderProbe();
    expect(screen.getByTestId('user')).toHaveTextContent('');

    signInAsClerk('user_b');
    rerenderProbe();
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Account B'));
    expect(syncToken).toHaveBeenLastCalledWith('test-jwt-user_b');
    expect(screen.getByTestId('status')).toHaveTextContent('signed-in');
  });

  it('surfaces a recoverable error when Clerk never issues a session token', async () => {
    const { syncToken } = installAuthBridge();
    setClerkIssuesToken(false);
    signInAsClerk('user_a');
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'), {
      timeout: 4_000,
    });
    expect(screen.getByTestId('error')).toHaveTextContent(/did not finish/i);
    expect(syncToken).not.toHaveBeenCalledWith(expect.stringMatching(/^test-jwt/));
  });

  it('re-syncs when Clerk sign-out fails instead of showing a sign-in form over a live session', async () => {
    installAuthBridge();
    signInAsClerk('user_a');
    const { rerenderProbe } = renderProbe();
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Account A'));

    const holder = (globalThis as unknown as { __clerkMock: { signOut: () => Promise<void> } })
      .__clerkMock;
    const original = holder.signOut;
    holder.signOut = () => Promise.reject(new Error('network down'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    rerenderProbe(); // pick up the failing signOut from the mocked useAuth
    try {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
      });
      await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Account A'));
      expect(screen.getByTestId('status')).toHaveTextContent('signed-in');
    } finally {
      holder.signOut = original;
      signOutFromClerk();
    }
  });
});

describe('AuthProvider database outage', () => {
  it('names the real problem instead of a generic error when the API cannot reach PostgreSQL', async () => {
    installAuthBridge();
    const bridge = window.bt as unknown as { auth: { me: ReturnType<typeof vi.fn> } };
    bridge.auth.me.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        error: { code: 'DATABASE_UNAVAILABLE', message: 'The service is temporarily unavailable.' },
      }),
    );
    signInAsClerk('user_a');
    renderProbe();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'), {
      timeout: 5_000,
    });
    expect(screen.getByTestId('error')).toHaveTextContent(/postgresql/i);
    // Retried before giving up: the first call plus three backoff attempts.
    expect(bridge.auth.me).toHaveBeenCalledTimes(4);
  });
});
