import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

export type AlertVariant = 'info' | 'success' | 'error';

const CONTAINER: Record<AlertVariant, string> = {
  info: 'border-border-default bg-surface-2 text-secondary',
  success: 'border-success/40 bg-success/10 text-primary',
  error: 'border-danger/40 bg-danger/10 text-primary',
};

const ICON_COLOR: Record<AlertVariant, string> = {
  info: 'text-info',
  success: 'text-success',
  error: 'text-danger',
};

const ICONS: Record<AlertVariant, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  error: AlertTriangle,
};

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children?: ReactNode;
  className?: string;
}

/** Inline notice that names the problem and (where relevant) the recovery. Bordered panel, no accent bar. */
export function Alert({ variant = 'info', title, children, className }: AlertProps) {
  const Icon = ICONS[variant];
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm',
        CONTAINER[variant],
        className,
      )}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', ICON_COLOR[variant])} aria-hidden="true" />
      <div className="min-w-0 space-y-0.5">
        {title ? <p className="font-semibold text-primary">{title}</p> : null}
        {children ? <div className="text-secondary">{children}</div> : null}
      </div>
    </div>
  );
}
