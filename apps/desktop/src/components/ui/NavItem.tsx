import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { NavId } from '../../lib/nav';

export interface NavItemProps {
  id: NavId;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onSelect: (id: NavId) => void;
}

export function NavItem({ id, label, icon: Icon, active, onSelect }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={cn(
        'group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        active
          ? 'bg-surface-2 text-primary'
          : 'text-secondary hover:bg-surface-1 hover:text-primary',
      )}
      {...(active ? { 'aria-current': 'page' as const } : {})}
    >
      <Icon
        className={cn(
          'size-4 shrink-0',
          active ? 'text-accent' : 'text-muted group-hover:text-secondary',
        )}
        aria-hidden="true"
      />
      <span className="truncate">{label}</span>
    </button>
  );
}
