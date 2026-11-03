import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** Honest placeholder used wherever a future-phase feature will live. No fake data. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-default bg-surface-1 px-6 py-12 text-center',
        className,
      )}
    >
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
  );
}
