import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import type { AuthSessionView, DesktopBridge, IpcOutcome } from '@buildtogether/shared';
import { App } from '../App';
import { signInAsClerk, setClerkLoaded } from './clerk';

/**
 * Renderer component tests (brief §13). Outside Electron the bridge is absent, so the app must show
 * the sign-in gate. With a mocked bridge returning a session, the authenticated shell and the active
 * workspace render. Only the calls the Home path makes are stubbed; the rest of the bridge is a cast
 * no-op since those surfaces are not mounted here.
 */

const session: AuthSessionView = {
  user: {
    id: 'u_1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    avatarUrl: null,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  workspaces: [
    {
      id: 'w_1',
      name: 'Acme Product',
      description: null,
      iconUrl: null,
      role: 'OWNER',
      memberCount: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

const ok = <T,>(data: T): Promise<IpcOutcome<T>> => Promise.resolve({ ok: true, data });

function installBridge() {
  const bridge = {
    getConfig: () =>
      ok({ apiBaseUrl: 'http://localhost:4000', appVersion: '0.0.0', platform: 'test' }),
    getPlatformInfo: () => ok({ platform: 'test', arch: 'x64' }),
    openExternal: () => ok({ ok: true }),
    window: { minimize: () => ok(null), toggleMaximize: () => ok(null), close: () => ok(null) },
    auth: {
      // Clerk owns auth: main holds the synced short-lived JWT and serves the sanitized `me` view.
      syncToken: () => ok(null),
      me: () => ok(session),
    },
    users: { updateMe: () => ok(session.user) },
    workspaces: {
      list: () => ok(session.workspaces),
      create: () => ok(session.workspaces[0]!),
      get: () => ok(session.workspaces[0]!),
      update: () => ok(session.workspaces[0]!),
    },
    members: {
      list: () => ok([]),
      updateRole: () => ok(null),
      remove: () => ok(null),
      transfer: () => ok(null),
    },
    invitations: {
      create: () => ok({ invitation: {} }),
      list: () => ok([]),
      revoke: () => ok(null),
      accept: () => ok(session.workspaces[0]!),
      pendingForMe: () => ok([]),
    },
    projects: {
      list: () =>
        ok([
          {
            id: 'p_1',
            workspaceId: 'w_1',
            name: 'Website Relaunch',
            slug: 'website-relaunch',
            description: 'Rebuild the marketing site',
            projectKey: 'WEB',
            status: 'ACTIVE',
            visibility: 'WORKSPACE',
            owner: { id: 'u_1', name: 'Ada Lovelace', avatarUrl: null },
            createdById: 'u_1',
            startDate: null,
            targetDate: '2026-12-31T00:00:00.000Z',
            icon: '🚀',
            color: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            archivedAt: null,
          },
        ]),
      create: () => ok(null),
      getOverview: () => ok(null),
      update: () => ok(null),
      archive: () => ok(null),
      restore: () => ok(null),
    },
  } as unknown as DesktopBridge;

  Object.defineProperty(window, 'bt', { value: bridge, configurable: true, writable: true });
}

afterEach(() => {
  Object.defineProperty(window, 'bt', { value: undefined, configurable: true, writable: true });
});

describe('desktop shell', () => {
  it('shows the sign-in gate when there is no authenticated session', async () => {
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: /sign in to your account/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign up/i })).toBeInTheDocument();
  });

  it('shows one stable loading state before Clerk UI is ready', async () => {
    setClerkLoaded(false);
    render(<App />);
    expect(await screen.findByText(/loading cue/i)).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: /authentication mode/i })).not.toBeInTheDocument();
  });

  it('renders the authenticated shell and active workspace once a session exists', async () => {
    installBridge();
    signInAsClerk();
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: /primary/i });
    expect(nav).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: /^members$/i })).toBeInTheDocument();
    expect(screen.getByText(/welcome back, ada/i)).toBeInTheDocument();
    expect(screen.getAllByText('Acme Product').length).toBeGreaterThan(0);
  });

  it('opens the workspace projects list from the navigation', async () => {
    installBridge();
    signInAsClerk();
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: /primary/i });
    fireEvent.click(within(nav).getByRole('button', { name: /projects/i }));
    // The mocked project surfaces once the async list resolves; no fake data is rendered on failure.
    expect(await screen.findByText('Website Relaunch')).toBeInTheDocument();
    expect(screen.getByText('WEB')).toBeInTheDocument();
  });
});
