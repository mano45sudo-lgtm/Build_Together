import { Hammer } from 'lucide-react';
import { NAV_ITEMS, type NavId } from '../lib/nav';
import { NavItem } from './ui/NavItem';
import { WorkspaceSwitcher } from '../features/workspace/WorkspaceSwitcher';

export interface SidebarProps {
  activeId: NavId;
  onSelectNav: (id: NavId) => void;
}

export function Sidebar({ activeId, onSelectNav }: SidebarProps) {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border-subtle bg-surface-1">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex size-8 items-center justify-center rounded-md border border-border-subtle bg-surface-2">
          <Hammer className="size-4 text-accent" aria-hidden="true" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-primary">BuildTogether</div>
          <div className="text-2xs text-muted">Builder Workspace</div>
        </div>
      </div>

      <div className="px-3 pb-2">
        <WorkspaceSwitcher />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="Primary">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => (
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

      <div className="border-t border-border-subtle px-4 py-3 text-2xs text-muted">
        Phase 2 · identity &amp; teams
      </div>
    </aside>
  );
}
