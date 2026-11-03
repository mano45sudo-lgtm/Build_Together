import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface TooltipProps {
  label: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}

/**
 * Lightweight accessible tooltip: shows on hover *and* keyboard focus. The trigger is never
 * stripped of its own semantics; we only wire `aria-describedby` to the bubble while visible.
 */
export function Tooltip({ label, children, side = 'top', className }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span {...(open ? { 'aria-describedby': id } : {})}>{children}</span>
      {open ? (
        <span
          role="tooltip"
          id={id}
          className={cn(
            'elevation-2 pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap',
            'rounded-md border border-border-default bg-surface-3 px-2 py-1 text-2xs text-primary',
            side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
          )}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
