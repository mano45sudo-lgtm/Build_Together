import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { EmptyStateVisual } from '../visuals/EmptyStateVisual';
import type { EmptyStateVariant } from '../visuals/EmptyStateVisual';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  /**
   * Optional purpose-built background composition from the graphics system. Omit for transient or
   * functional empties (search results, errors) — reserve a visual for meaningful first-run states.
   */
  visual?: EmptyStateVariant | undefined;
  className?: string;
}

/** Honest placeholder used wherever a future-phase feature will live. No fake data. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  visual,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-lg border border-dashed border-border-default bg-surface-1 px-6 py-12 text-center',
        className,
      )}
    >
      {visual ? <EmptyStateVisual variant={visual} /> : null}
      <div className="relative z-10 flex flex-col items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-lg border border-border-subtle bg-surface-2">
          <Icon className="size-5 text-accent" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-primary">{title}</h3>
          {description ? (
            <p className="mx-auto max-w-sm text-sm text-secondary">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
    </div>
  );
}
