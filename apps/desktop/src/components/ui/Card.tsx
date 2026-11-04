import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface CardProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** Content panel. Elevation is declared once (border); no nested cards. */
export function Card({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: CardProps) {
  const hasHeader = title !== undefined || description !== undefined || action !== undefined;
  return (
    <section className={cn('rounded-xl border border-border-default bg-surface-1', className)}>
      {hasHeader ? (
        <header className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
          <div className="min-w-0 space-y-0.5">
            {title ? <h2 className="text-sm font-semibold text-primary">{title}</h2> : null}
            {description ? <p className="text-xs text-secondary">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={cn('px-5 py-4', bodyClassName)}>{children}</div>
    </section>
  );
}
