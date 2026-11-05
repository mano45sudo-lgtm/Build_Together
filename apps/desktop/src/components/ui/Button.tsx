import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from './Spinner';

/**
 * BuildTogether button system — **Monochrome Precision** (Vercel-inspired). One reusable, token-driven
 * control shared by every action in the renderer. Variants encode *intent*, sizes encode *density*, and
 * every state (hover / active / focus-visible / disabled / loading) is defined once here so no screen
 * re-implements a button. Colour stays reserved: the primary action is a light surface (never a brand
 * hue); the only fills are the semantic success / destructive / warning states.
 */

export type ButtonVariant =
  'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'success' | 'warning';

/** sm = compact (32px) · md = default (40px) · lg = large (44px). */
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  // Layout + shape.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium select-none ' +
  // Motion: restrained colour transition only (150ms).
  'transition-[background-color,border-color,color,transform] duration-150 ease-out ' +
  // Keyboard focus is ALWAYS visible: a white ring sitting on a canvas gap so it reads even around the
  // near-white primary button. Never rely on the browser default.
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ' +
  // Disabled: non-interactive + muted, but the label stays legible (no pointer events, no click).
  'disabled:pointer-events-none disabled:opacity-50';

const VARIANTS: Record<ButtonVariant, string> = {
  // Primary action = light surface, near-black text. The single most prominent control on a surface.
  primary: 'bg-accent text-accent-foreground hover:bg-accent-hover active:bg-accent-active',
  // Supporting action = graphite surface with a hairline border.
  secondary:
    'border border-border-default bg-surface-2 text-primary hover:bg-surface-3 active:bg-surface-3',
  // Low-emphasis action that still needs a boundary.
  outline:
    'border border-border-default bg-transparent text-primary hover:bg-surface-2 active:bg-surface-3',
  // Contextual / inline action: muted until hovered, no permanent border.
  ghost:
    'bg-transparent text-secondary hover:bg-surface-2 hover:text-primary active:bg-surface-3 active:text-primary',
  // Irreversible / risky action. Solid, restrained red — reserved for true destruction.
  destructive: 'bg-danger-fill text-white hover:bg-danger-fill-hover active:translate-y-px',
  // Positive confirmation (complete / approve / confirm). Never for ordinary navigation.
  success: 'bg-success-fill text-white hover:bg-success-fill-hover active:translate-y-px',
  // Caution-requiring action. Amber is light, so the label is dark for contrast.
  warning:
    'bg-warning-fill text-warning-fill-foreground hover:bg-warning-fill-hover active:translate-y-px',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
};

/**
 * The full class string for a variant + size. Exported so composite controls (SplitButton, toolbar
 * triggers) reuse the exact same recipe instead of re-declaring colours — one source of truth.
 */
export function buttonClassNames(variant: ButtonVariant, size: ButtonSize = 'md'): string {
  return cn(BASE, VARIANTS[variant], SIZES[size]);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Async in-flight state: shows a spinner, blocks repeat activation, keeps the label readable. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    type = 'button',
    loading = false,
    disabled,
    children,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
});

/** Square icon-only control. `aria-label` is required — an icon button is never unlabeled. */
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string;
  variant?: ButtonVariant;
  /** sm = 32px (default, toolbar density) · md = 36px · lg = 44px (touch/prominent). */
  size?: 'sm' | 'md' | 'lg';
}

const ICON_SIZES: Record<NonNullable<IconButtonProps['size']>, string> = {
  sm: 'size-8',
  md: 'size-9',
  lg: 'size-11',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, variant = 'ghost', size = 'sm', type = 'button', disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={cn(BASE, VARIANTS[variant], ICON_SIZES[size], 'shrink-0 p-0', className)}
      {...rest}
    >
      {children}
    </button>
  );
});
