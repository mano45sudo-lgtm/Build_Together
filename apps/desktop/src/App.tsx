import { useEffect, useState } from 'react';
import { Hammer } from 'lucide-react';
import { AppShell } from './layouts/AppShell';
import { EmptyState } from './components/ui/EmptyState';
import { Dialog } from './components/ui/Dialog';
import { Input } from './components/ui/Input';
import { Spinner } from './components/ui/Spinner';
import { NAV_ITEMS, type NavId } from './lib/nav';
import { teardown as teardownChat } from './lib/chat-client';
import { AuthProvider, useAuth } from './state/AuthProvider';
import { WelcomeScreen } from './features/auth/WelcomeScreen';
import { HomeScreen } from './features/home/HomeScreen';
import { MessagesScreen } from './features/messages/MessagesScreen';
import { TeamScreen } from './features/team/TeamScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';

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
  const { status, session, signOut } = useAuth();
  const [activeId, setActiveId] = useState<NavId>('home');
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

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

  if (status === 'checking') return <Splash />;
  if (status === 'signed-out' || !session) return <WelcomeScreen />;

  const active = NAV_ITEMS.find((item) => item.id === activeId) ?? NAV_ITEMS[0]!;

  // Logout / session loss must not leave a live Nexconn session or an in-memory client token behind.
  const handleSignOut = () => {
    void teardownChat();
    void signOut();
  };

  const section = (() => {
    switch (activeId) {
      case 'home':
        return <HomeScreen onOpenTeam={() => setActiveId('team')} />;
      case 'messages':
        return <MessagesScreen />;
      case 'team':
        return <TeamScreen />;
      case 'settings':
        return <SettingsScreen />;
      default:
        return (
          <div className="w-full max-w-xl">
            <EmptyState icon={active.icon} title={active.label} description={active.arrival} />
          </div>
        );
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
        description="Search across workspaces, projects and tasks."
      >
        <Input placeholder="Search BuildTogether…" disabled />
        <p className="mt-3 text-sm text-secondary">
          Search results arrive with the project and messaging phases.
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
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
