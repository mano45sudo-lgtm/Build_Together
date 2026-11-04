import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface SpinnerProps {
  className?: string;
  label?: string;
}

/** Accessible loading indicator. Announces itself; the visible label is optional. */
export function Spinner({ className, label = 'Loading' }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className="inline-flex">
      <Loader2 className={cn('size-4 animate-spin', className)} aria-hidden="true" />
    </span>
  );
}
