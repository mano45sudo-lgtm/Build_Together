import type { ReactNode } from 'react';
import { Hammer } from 'lucide-react';

interface AuthLayoutProps {
  children: ReactNode;
  /** Shown under the form column, e.g. a slow-loading notice. */
  footer?: ReactNode;
}

/**
 * Auth page shell: the wordmark pinned top-left and a single narrow column centred in the window.
 * Everything else is deliberately absent so the one decision on the page (how to sign in) is the
 * only thing to read.
 */
export function AuthLayout({ children, footer }: AuthLayoutProps) {
  return (
    <main className="relative flex h-full min-h-0 w-full flex-col overflow-y-auto bg-canvas font-sans text-primary">
      <header className="flex shrink-0 items-center gap-2.5 px-6 pt-6 sm:px-8 sm:pt-7">
        <span className="grid size-8 place-items-center rounded-lg border border-border-default bg-surface-1">
          <Hammer className="size-4 text-primary" strokeWidth={1.9} aria-hidden="true" />
        </span>
        <span className="text-lg font-semibold tracking-[0.06em]">CUE</span>
      </header>

      <div className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-[380px]">{children}</div>
      </div>

      {footer ? <div className="shrink-0 px-6 pb-8 text-center">{footer}</div> : null}

      {/* Clerk mounts its bot-protection widget here during sign-up when the instance enables it. */}
      <div id="clerk-captcha" />
    </main>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle: ReactNode }) {
  return (
    <header className="text-center">
      <h1 className="text-[2rem] leading-[1.15] font-semibold tracking-[-0.03em] text-balance">
        {title}
      </h1>
      <p className="mt-3 text-[0.9375rem] leading-6 text-secondary text-pretty">{subtitle}</p>
    </header>
  );
}

/** Low-emphasis text action (back, resend, alternatives). */
export function TextAction({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-sm text-sm font-medium text-secondary underline-offset-4 transition-colors duration-[var(--duration-fast)] hover:text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
    >
      {children}
    </button>
  );
}
