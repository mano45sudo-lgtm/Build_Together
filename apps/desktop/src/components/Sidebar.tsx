import { ChevronsUpDown, Hammer, Layers } from 'lucide-react';
import { NAV_ITEMS, type NavId } from '../lib/nav';
import { NavItem } from './ui/NavItem';
import { Tooltip } from './ui/Tooltip';

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
        <Tooltip label="Workspaces arrive in a later phase" side="bottom" className="w-full">
          <button
            type="button"
            disabled
            className="flex w-full items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-2 px-2.5 py-1.5 text-xs text-secondary opacity-70"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Layers className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
              <span className="truncate">Personal Workspace</span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
          </button>
        </Tooltip>
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
        Phase 1 · desktop foundation
      </div>
    </aside>
  );
}
