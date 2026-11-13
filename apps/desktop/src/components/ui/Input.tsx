import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-md border border-border-default bg-surface-2 px-3 text-sm text-primary',
        'placeholder:text-muted transition-colors duration-150 ease-out',
        'focus-visible:border-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  );
});
