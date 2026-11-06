import { Suspense, lazy, useEffect, useState } from 'react';
import { Hammer } from 'lucide-react';
import { ClerkProvider } from '@clerk/electron/react';
import { AppShell } from './layouts/AppShell';
import { Dialog } from './components/ui/Dialog';
import { Button } from './components/ui/Button';
import { Input } from './components/ui/Input';
import { Spinner } from './components/ui/Spinner';
import { NAV_ITEMS, type NavId } from './lib/nav';
import { AuthProvider, useAuth } from './state/AuthProvider';
import { WelcomeScreen } from './features/auth/WelcomeScreen';
import { HomeScreen } from './features/home/HomeScreen';
import { MyWorkScreen } from './features/mywork/MyWorkScreen';
import { TeamScreen } from './features/team/TeamScreen';
import { ProjectsScreen } from './features/projects/ProjectsScreen';
import { DecisionsScreen } from './features/decisions/DecisionsScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';

/**
 * Chat lives behind a lazy boundary. `MessagesScreen` transitively imports `chat-client` which
 * transitively imports `@rongcloud/imlib-next` — a ~700 KB transport SDK that touches browser
 * primitives (WebSocket, workers, `path` externals in the engine). Loading it eagerly means any
 * future SDK-side module-evaluation failure blanks the entire renderer. Lazy-loading confines
 * failures to the Messages tab and keeps unauthenticated/authenticated UI (Splash, WelcomeScreen,
 * Home, Team, Settings) rendering even when Nexconn is unreachable or misconfigured.
 */
const MessagesScreen = lazy(() =>
  import('./features/messages/MessagesScreen').then((m) => ({ default: m.MessagesScreen })),
);

const clerkAppearance = {
  variables: {
    colorPrimary: '#c2410c',
    colorBackground: '#111111',
    colorText: '#f5f5f5',
    colorTextSecondary: '#a1a1aa',
    colorInputBackground: '#252529',
    colorInputText: '#f5f5f5',
    colorDanger: '#f87171',
    colorSuccess: '#4ade80',
    borderRadius: '0.5rem',
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif',
  },
  elements: {
    footer: { display: 'none' },
    card: { boxShadow: 'none', background: 'transparent', padding: '0' },
    cardBox: { boxShadow: 'none', width: '100%', maxWidth: '100%' },
    rootBox: { width: '100%', maxWidth: '100%' },
    headerTitle: { display: 'none' },
    headerSubtitle: { display: 'none' },
    formButtonPrimary: { backgroundColor: '#c2410c', color: '#111111' },
    socialButtonsBlockButton: {
      backgroundColor: 'transparent',
      color: '#e5e5e5',
      borderColor: '#2a2a2a',
    },
    formFieldLabel: { color: '#e5e5e5' },
    formFieldInput: {
      backgroundColor: '#252529',
      color: '#f5f5f5',
      borderColor: '#34343a',
    },
    dividerLine: { backgroundColor: '#303036' },
    dividerText: { color: '#a1a1aa' },
    footerActionText: { color: '#a1a1aa' },
    footerActionLink: { color: '#fdba74' },
  },
} as const;

/** Boot splash shown while the persisted desktop session is being restored. */
function Splash({ message = 'Loading CUE…' }: { message?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center gap-3 bg-canvas text-secondary">
      <Hammer className="size-5 text-accent" aria-hidden="true" />
      <Spinner />
      <span className="text-sm">{message}</span>
    </div>
  );
}

function AuthRecovery({
  message,
  onRetry,
  onSignOut,
}: {
  message: string;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 text-primary">
      <section className="w-full max-w-md rounded-xl border border-border-subtle bg-surface-1 p-6">
        <h1 className="text-lg font-semibold">Couldn’t finish signing in</h1>
        <p role="alert" className="mt-3 text-sm leading-6 text-secondary">
          {message}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={onRetry}>Try again</Button>
          <Button variant="secondary" onClick={onSignOut}>
            Return to sign in
          </Button>
        </div>
      </section>
    </main>
  );
}

function Shell() {
  const { status, session, signOut, clerkLoaded, authError, retryAuth } = useAuth();
  const [activeId, setActiveId] = useState<NavId>('home');
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  // Tracks whether the user has opened Messages at least once during this session. It gates the
  // lazy `chat-client` teardown import so a sign-out on a session that never touched chat does not
  // pull the SDK just to run a no-op.
  const [chatMounted, setChatMounted] = useState(false);

  // Keyboard-first: ⌘/Ctrl+K toggles global search (entry point only; results arrive in a later phase).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (activeId === 'messages') setChatMounted(true);
  }, [activeId]);

  if (status === 'checking')
    return <Splash message={clerkLoaded ? 'Finishing sign-in…' : 'Loading CUE…'} />;
  if (status === 'error') {
    return (
      <AuthRecovery
        message={
          authError ??
          'Your account returned from Clerk, but BuildTogether could not finish setting up your session.'
        }
        onRetry={retryAuth}
        onSignOut={() => void signOut()}
      />
    );
  }
  if (status === 'signed-out') return <WelcomeScreen />;
  if (!session) return <Splash message="Preparing your workspace…" />;

  const active = NAV_ITEMS.find((item) => item.id === activeId) ?? NAV_ITEMS[0]!;

  // Logout / session loss must not leave a live Nexconn session or an in-memory client token behind.
  // The chat module is only loaded when the user actually opened Messages; when they did, tear it
  // down asynchronously so a hanging / failing SDK never blocks the sign-out UX. A SDK-side failure
  // is logged (never swallowed) and the BT session still terminates.
  const handleSignOut = () => {
    if (chatMounted) {
      void import('./lib/chat-client')
        .then((m) => m.teardown())
        .catch((error: unknown) => {
          console.warn('[desktop] chat teardown failed', error);
        });
    }
    void signOut();
  };

  const section = (() => {
    switch (activeId) {
      case 'home':
        return (
          <HomeScreen
            onOpenTeam={() => setActiveId('team')}
            onOpenProjects={() => setActiveId('projects')}
          />
        );
      case 'mywork':
        return <MyWorkScreen />;
      case 'messages':
        return (
          <Suspense
            fallback={
              <div className="flex h-full w-full items-center justify-center gap-3 text-secondary">
                <Spinner />
                <span className="text-sm">Loading messages…</span>
              </div>
            }
          >
            <MessagesScreen />
          </Suspense>
        );
      case 'team':
        return <TeamScreen />;
      case 'projects':
        return <ProjectsScreen onOpenMessages={() => setActiveId('messages')} />;
      case 'decisions':
        return <DecisionsScreen />;
      case 'settings':
        return <SettingsScreen />;
      default:
        // Every NavId maps to a real screen above; this is an unreachable defensive fallback.
        return null;
    }
  })();

  return (
    <>
      <AppShell
        activeId={activeId}
        sectionLabel={active.label}
        sectionIcon={active.icon}
        accountName={session.user.name}
        onSelectNav={setActiveId}
        onOpenSearch={() => setSearchOpen(true)}
        onQuickCreate={() => setQuickCreateOpen(true)}
        onOpenSettings={() => setActiveId('settings')}
        onSignOut={handleSignOut}
        fullBleed={activeId === 'messages'}
      >
        {section}
      </AppShell>

      <Dialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="Search"
        description="Search across workspaces, projects and conversations."
      >
        <Input placeholder="Search BuildTogether…" disabled />
        <p className="mt-3 text-sm text-secondary">
          Global search is a planned feature and is not wired to the API yet.
        </p>
      </Dialog>

      <Dialog
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        title="Quick create"
        description="Create tasks, notes and decisions from anywhere."
      >
        <p className="text-sm text-secondary">
          Quick create arrives with task management in a later phase.
        </p>
      </Dialog>
    </>
  );
}

export function App() {
  // Clerk owns authentication (ADR-0006). The publishable key is a public, non-secret value that must
  // be provided via the environment; without it Clerk cannot initialize, so we surface an explicit
  // configuration error rather than mounting a provider that would fail silently into a dead UI.
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-canvas text-secondary">
        <Hammer className="size-5 text-accent" aria-hidden="true" />
        <span className="text-sm">
          Authentication is not configured (missing Clerk publishable key).
        </span>
      </div>
    );
  }
  return (
    <ClerkProvider publishableKey={publishableKey} appearance={clerkAppearance}>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </ClerkProvider>
  );
}
