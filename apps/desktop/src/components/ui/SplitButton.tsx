import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button, buttonClassNames } from './Button';
import type { ButtonSize, ButtonVariant } from './Button';

export interface SplitButtonItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
}

export interface SplitButtonProps {
  /** Label for the primary action (the left half). */
  children: ReactNode;
  /** Fires when the primary action is clicked. */
  onClick: () => void;
  /** Secondary actions revealed by the caret. */
  items: SplitButtonItem[];
  /** Accessible name for the caret toggle (e.g. "More create options"). */
  menuLabel: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Optional leading icon on the primary action. */
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

/**
 * A primary action joined to a dropdown of related secondary actions (e.g. "Create Task" + a menu of
 * other create targets). The left half is a real `Button` (so it inherits every variant/state); the
 * caret reuses the same class recipe so the two read as one control. Keyboard-complete: the menu
 * toggles on Enter/Space, navigates with ArrowUp/Down, and closes on Escape or outside click.
 */
export function SplitButton({
  children,
  onClick,
  items,
  menuLabel,
  variant = 'primary',
  size = 'md',
  icon,
  disabled = false,
  loading = false,
  className,
}: SplitButtonProps) {
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
    if (count === 0) return;
    const current = itemRefs.current.findIndex((node) => node === document.activeElement);
    const next =
      event.key === 'ArrowDown' ? (current + 1 + count) % count : (current - 1 + count) % count;
    itemRefs.current[next]?.focus();
  };

  const runItem = (index: number) => {
    setOpen(false);
    items[index]?.onSelect();
  };

  return (
    <div ref={rootRef} className={cn('relative inline-flex items-stretch', className)}>
      <Button
        variant={variant}
        size={size}
        onClick={onClick}
        disabled={disabled}
        loading={loading}
        className="rounded-r-none"
      >
        {icon}
        {children}
      </Button>
      <button
        type="button"
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || loading}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={onMenuKeyDown}
        className={cn(
          buttonClassNames(variant, size),
          // Join to the primary half: square the left corners, tighten to an icon-width caret.
          'rounded-l-none border-l border-black/10 px-2',
          'disabled:pointer-events-none disabled:opacity-50',
        )}
      >
        <ChevronDown className="size-4 opacity-70" aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          onKeyDown={onMenuKeyDown}
          className="elevation-2 absolute right-0 z-50 mt-1 min-w-44 rounded-lg border border-border-default bg-surface-1 p-1"
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
                onClick={() => runItem(index)}
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
