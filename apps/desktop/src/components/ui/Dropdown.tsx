import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface DropdownItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
}

export interface DropdownProps {
  /** Non-interactive content rendered inside the trigger button (icon, avatar, text). */
  trigger: ReactNode;
  triggerLabel: string;
  items: DropdownItem[];
  align?: 'start' | 'end';
  className?: string;
}

/** Menu foundation: click to toggle, Escape / outside-click to dismiss, arrow-key navigation. */
export function Dropdown({
  trigger,
  triggerLabel,
  items,
  align = 'end',
  className,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const onMenuKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const count = items.length;
    const current = itemRefs.current.findIndex((node) => node === document.activeElement);
    const next =
      event.key === 'ArrowDown' ? (current + 1 + count) % count : (current - 1 + count) % count;
    itemRefs.current[next]?.focus();
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {trigger}
      </button>
      {open ? (
        <div
          role="menu"
          onKeyDown={onMenuKeyDown}
          className={cn(
            'elevation-2 absolute z-50 mt-1 min-w-44 rounded-lg border border-border-default bg-surface-1 p-1',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-secondary transition-colors duration-150 ease-out hover:bg-surface-2 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {Icon ? <Icon className="size-4 shrink-0 text-muted" aria-hidden="true" /> : null}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
