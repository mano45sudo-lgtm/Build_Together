import { Suspense, lazy, useEffect, useState } from 'react';
import { Hammer } from 'lucide-react';
import { ClerkProvider } from '@clerk/electron/react';
import { AppShell } from './layouts/AppShell';
import { Dialog } from './components/ui/Dialog';
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
    colorPrimary: '#d4d7dc',
    colorBackground: '#14171c',
    colorText: '#e6e8eb',
    colorTextSecondary: '#9aa0a8',
    colorInputBackground: '#0f1216',
    colorInputText: '#e6e8eb',
    colorDanger: '#f87171',
    colorSuccess: '#4ade80',
    borderRadius: '0.5rem',
  },
  elements: {
    footer: { display: 'none' },
    card: { boxShadow: 'none', background: 'transparent', padding: '0' },
    cardBox: { boxShadow: 'none', width: '100%', maxWidth: '100%' },
    rootBox: { width: '100%', maxWidth: '100%' },
  },
} as const;

/** Boot splash shown while the persisted desktop session is being restored. */
function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center gap-3 bg-canvas text-secondary">
      <Hammer className="size-5 text-accent" aria-hidden="true" />
      <Spinner />
      <span className="text-sm">Loading BuildTogether…</span>
    </div>
  );
}

function Shell() {
  const { status, session, signOut, clerkLoaded } = useAuth();
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

  if (status === 'checking' && !clerkLoaded) return <Splash />;
  if (status === 'signed-out' || !session) return <WelcomeScreen />;

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
