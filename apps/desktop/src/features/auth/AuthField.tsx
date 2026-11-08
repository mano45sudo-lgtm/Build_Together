import { forwardRef, type ReactNode } from 'react';
import { Input, type InputProps } from '../../components/ui/Input';
import { cn } from '../../lib/cn';

interface AuthFieldProps extends InputProps {
  id: string;
  label: string;
  /** Right-aligned action beside the label (e.g. "Forgot password?"). */
  action?: ReactNode;
}

/** Label-over-input field at the auth page's scale: 14px label, 40px control. */
export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField(
  { id, label, action, className, ...rest },
  ref,
) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-primary">
          {label}
        </label>
        {action}
      </div>
      <Input
        ref={ref}
        id={id}
        className={cn('h-10 px-3.5 text-[0.9375rem] hover:border-border-strong', className)}
        {...rest}
      />
    </div>
  );
});
