import type { ReactNode } from 'react';
import { Plus, Search, type LucideIcon } from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { ApiStatusIndicator } from '../components/ApiStatusIndicator';
import { Button, IconButton } from '../components/ui/Button';
import type { NavId } from '../lib/nav';

export interface AppShellProps {
  activeId: NavId;
  sectionLabel: string;
  sectionIcon: LucideIcon;
  accountName: string;
  onSelectNav: (id: NavId) => void;
  onOpenSearch: () => void;
  onQuickCreate: () => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
  /** When true the content region fills the frame (no centering/padding) — used by the chat panes. */
  fullBleed?: boolean;
  children: ReactNode;
}

/** The persistent desktop frame: navigation rail (with account), and a minimal context header. */
export function AppShell({
  activeId,
  sectionLabel,
  sectionIcon: SectionIcon,
  accountName,
  onSelectNav,
  onOpenSearch,
  onQuickCreate,
  onOpenSettings,
  onSignOut,
  fullBleed = false,
  children,
}: AppShellProps) {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 overflow-hidden bg-canvas text-primary">
      <Sidebar
        activeId={activeId}
        accountName={accountName}
        onSelectNav={onSelectNav}
        onOpenSettings={onOpenSettings}
        onSignOut={onSignOut}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-canvas px-4">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-primary">
            <SectionIcon className="size-4 shrink-0 text-muted" aria-hidden="true" />
            <span className="truncate">{sectionLabel}</span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onOpenSearch}>
              <Search className="size-3.5" aria-hidden="true" />
              Search
              <kbd className="ml-1 rounded border border-border-default bg-surface-3 px-1 text-2xs text-muted">
                ⌘K
              </kbd>
            </Button>

            <IconButton aria-label="Quick create" variant="secondary" onClick={onQuickCreate}>
              <Plus className="size-4" aria-hidden="true" />
            </IconButton>

            <ApiStatusIndicator />
          </div>
        </header>

        <main
          className={
            fullBleed
              ? 'flex min-h-0 flex-1 overflow-hidden'
              : 'flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-8'
          }
        >
          {children}
        </main>
      </div>
    </div>
  );
}
