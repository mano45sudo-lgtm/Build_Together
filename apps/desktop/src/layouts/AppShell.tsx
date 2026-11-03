import type { ReactNode } from 'react';
import {
  LogOut,
  Plus,
  Search,
  Settings as SettingsIcon,
  User,
  type LucideIcon,
} from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { ApiStatusIndicator } from '../components/ApiStatusIndicator';
import { Avatar } from '../components/ui/Avatar';
import { Button, IconButton } from '../components/ui/Button';
import { Dropdown } from '../components/ui/Dropdown';
import type { NavId } from '../lib/nav';

export interface AppShellProps {
  activeId: NavId;
  sectionLabel: string;
  sectionIcon: LucideIcon;
  onSelectNav: (id: NavId) => void;
  onOpenSearch: () => void;
  onQuickCreate: () => void;
  onOpenSettings: () => void;
  children: ReactNode;
}

/** The persistent desktop frame: navigation rail, header (search / create / status / account). */
export function AppShell({
  activeId,
  sectionLabel,
  sectionIcon: SectionIcon,
  onSelectNav,
  onOpenSearch,
  onQuickCreate,
  onOpenSettings,
  children,
}: AppShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas text-primary">
      <Sidebar activeId={activeId} onSelectNav={onSelectNav} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-surface-1 px-4">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-primary">
            <SectionIcon className="size-4 shrink-0 text-accent" aria-hidden="true" />
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

            <Dropdown
              triggerLabel="Account"
              trigger={<Avatar name="Guest User" size="sm" />}
              items={[
                { id: 'profile', label: 'Profile', icon: User, onSelect: onOpenSettings },
                { id: 'settings', label: 'Settings', icon: SettingsIcon, onSelect: onOpenSettings },
                {
                  id: 'sign-out',
                  label: 'Sign out (later phase)',
                  icon: LogOut,
                  onSelect: () => {},
                },
              ]}
            />
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
