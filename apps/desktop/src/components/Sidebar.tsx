import { Hammer, LogOut, User } from 'lucide-react';
import { MAIN_NAV, WORKSPACE_NAV, type NavId } from '../lib/nav';
import { NavItem } from './ui/NavItem';
import { Avatar } from './ui/Avatar';
import { Dropdown } from './ui/Dropdown';
import { WorkspaceSwitcher } from '../features/workspace/WorkspaceSwitcher';

export interface SidebarProps {
  activeId: NavId;
  accountName: string;
  onSelectNav: (id: NavId) => void;
  onOpenSettings: () => void;
  onSignOut: () => void;
}

export function Sidebar({
  activeId,
  accountName,
  onSelectNav,
  onOpenSettings,
  onSignOut,
}: SidebarProps) {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border-subtle bg-sidebar">
      {/* Brand + workspace context */}
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex size-8 items-center justify-center rounded-md border border-border-subtle bg-surface-2">
          <Hammer className="size-4 text-primary" aria-hidden="true" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-primary">CUE</div>
          <div className="text-2xs text-muted">From conversation to completion</div>
        </div>
      </div>

      <div className="px-3 pb-2">
        <WorkspaceSwitcher />
      </div>

      {/* Primary task navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="Primary">
        <ul className="space-y-0.5">
          {MAIN_NAV.map((item) => (
            <li key={item.id}>
              <NavItem
                id={item.id}
                label={item.label}
                icon={item.icon}
                active={item.id === activeId}
                onSelect={onSelectNav}
              />
            </li>
          ))}
        </ul>

        <div className="my-2 border-t border-border-subtle" role="separator" />

        <p className="px-2.5 pb-1 text-2xs font-medium uppercase tracking-wide text-muted">
          Workspace
        </p>
        <ul className="space-y-0.5">
          {WORKSPACE_NAV.map((item) => (
            <li key={item.id}>
              <NavItem
                id={item.id}
                label={item.label}
                icon={item.icon}
                active={item.id === activeId}
                onSelect={onSelectNav}
              />
            </li>
          ))}
        </ul>
      </nav>

      {/* Account, anchored to the bottom */}
      <div className="border-t border-border-subtle p-2">
        <Dropdown
          align="start"
          drop="up"
          triggerLabel="Account menu"
          triggerClassName="w-full"
          trigger={
            <span className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors duration-150 hover:bg-surface-2">
              <Avatar name={accountName} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm text-primary">{accountName}</span>
            </span>
          }
          items={[
            { id: 'profile', label: 'Profile & settings', icon: User, onSelect: onOpenSettings },
            { id: 'sign-out', label: 'Sign out', icon: LogOut, onSelect: onSignOut },
          ]}
        />
      </div>
    </aside>
  );
}
