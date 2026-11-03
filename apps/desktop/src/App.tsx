import { useEffect, useState } from 'react';
import { AppShell } from './layouts/AppShell';
import { EmptyState } from './components/ui/EmptyState';
import { Dialog } from './components/ui/Dialog';
import { Input } from './components/ui/Input';
import { NAV_ITEMS, type NavId } from './lib/nav';
import { FALLBACK_API_BASE_URL, isDesktopRuntime } from './lib/config';

/**
 * Phase 1 desktop shell. Establishes a stable, secure Electron renderer and the product's
 * navigation skeleton — deliberately NOT a finished product. Every future-phase section is an
 * honest placeholder; no fake projects, messages, tasks or analytics are rendered.
 */
export function App() {
  const [activeId, setActiveId] = useState<NavId>('home');
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  const active = NAV_ITEMS.find((item) => item.id === activeId) ?? NAV_ITEMS[0]!;

  // Keyboard-first: ⌘/Ctrl+K toggles global search (entry point only).
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

  return (
    <>
      <AppShell
        activeId={activeId}
        sectionLabel={active.label}
        sectionIcon={active.icon}
        onSelectNav={setActiveId}
        onOpenSearch={() => setSearchOpen(true)}
        onQuickCreate={() => setQuickCreateOpen(true)}
        onOpenSettings={() => setActiveId('settings')}
      >
        <div className="w-full max-w-xl">
          <EmptyState
            icon={active.icon}
            title={`${active.label} — placeholder`}
            description={`${active.arrival} This is the Phase 1 desktop foundation; no product data is shown.`}
          />
          {!isDesktopRuntime() ? (
            <p className="mt-4 text-center text-2xs text-muted">
              Running outside the desktop shell — API base falls back to{' '}
              <code className="font-mono text-secondary">
                {import.meta.env.VITE_API_BASE_URL ?? FALLBACK_API_BASE_URL}
              </code>
              . Inside Electron it is resolved by the main process.
            </p>
          ) : null}
        </div>
      </AppShell>

      <Dialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="Search"
        description="Search across workspaces, projects and tasks."
      >
        <Input placeholder="Search BuildTogether…" disabled />
        <p className="mt-3 text-sm text-muted">
          Search results arrive with the workspace and project phases.
        </p>
      </Dialog>

      <Dialog
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        title="Quick create"
        description="Create tasks, notes and decisions from anywhere."
      >
        <p className="text-sm text-muted">
          Quick create arrives with task management in a later phase.
        </p>
      </Dialog>
    </>
  );
}
