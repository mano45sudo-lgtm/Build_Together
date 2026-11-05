import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface ButtonGroupProps {
  /** `Button` / `IconButton` children, rendered as one connected control. */
  children: ReactNode;
  /** Accessible name for the group (e.g. "View mode"). Strongly recommended. */
  ariaLabel?: string;
  className?: string;
}

/**
 * Groups related, same-weight actions (view-mode switches, segmented controls, inline action clusters)
 * into one visually connected control. It only composes existing `Button`s — it never restyles them,
 * so every child keeps its variant, states and behaviour. Inner corners collapse and shared borders
 * overlap by 1px so the group reads as a single unit while each segment stays independently focusable.
 */
export function ButtonGroup({ children, ariaLabel, className }: ButtonGroupProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-stretch',
        // Collapse the seam: square the touching corners and overlap the 1px borders.
        '[&>*+*]:-ml-px [&>*:not(:first-child)]:rounded-l-none [&>*:not(:last-child)]:rounded-r-none',
        className,
      )}
    >
      {children}
    </div>
  );
}
