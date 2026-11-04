import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface FieldProps {
  label: string;
  htmlFor?: string | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  children: ReactNode;
  className?: string;
}

/** Form field scaffold: label, control, and a single slot for hint-or-error (never both). */
export function Field({ label, htmlFor, hint, error, required, children, className }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-secondary">
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-2xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-2xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
