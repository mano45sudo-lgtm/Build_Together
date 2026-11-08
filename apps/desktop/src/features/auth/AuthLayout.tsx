import type { ReactNode } from 'react';
import { Hammer } from 'lucide-react';
import { Spinner } from '../../components/ui/Spinner';
import { BrandMarkBackground, SoftLighting } from '../../components/visuals';

export type AuthMode = 'signin' | 'signup';

interface AuthLayoutProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  clerkLoaded: boolean;
  clerkTimedOut: boolean;
  onReload: () => void;
  children: ReactNode;
}

const COPY: Record<AuthMode, { title: string; subtitle: string }> = {
  signin: { title: 'Welcome back', subtitle: 'Sign in to continue to CUE.' },
  signup: { title: 'Create your account', subtitle: 'Get your team from conversation to done.' },
};

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-7 place-items-center rounded-md border border-border-default bg-surface-2">
        <Hammer className="size-3.5 text-primary" strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="text-sm font-semibold tracking-[0.08em]">CUE</span>
    </div>
  );
}

/** Presentation shell for the auth screens; Clerk owns the credential, verification and OAuth flows. */
export function AuthLayout({
  mode,
  onModeChange,
  clerkLoaded,
  clerkTimedOut,
  onReload,
  children,
}: AuthLayoutProps) {
  const copy = COPY[mode];

  return (
    <main className="flex h-full min-h-0 w-full overflow-y-auto bg-canvas font-sans text-primary">
      <div className="m-auto grid w-full max-w-[880px] grid-cols-1 p-4 sm:p-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:p-10">
        <section
          aria-label="CUE"
          className="relative hidden min-h-[560px] flex-col justify-between overflow-hidden rounded-l-xl border border-r-0 border-border-subtle bg-sidebar p-10 lg:flex"
        >
          <SoftLighting position="top-left" size="95% 70%" />
          <BrandMarkBackground size={440} className="-right-28 -bottom-24" />

          <div className="relative z-10">
            <Wordmark />
          </div>

          <div className="relative z-10">
            <p className="text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.025em] text-balance">
              From conversation
              <br />
              to completion.
            </p>
            <p className="mt-4 max-w-[32ch] text-sm leading-6 text-secondary">
              Messages, tasks and decisions in one workspace, each linked to the conversation that
              started it.
            </p>
          </div>
        </section>

        <section className="flex min-w-0 flex-col justify-center rounded-xl border border-border-subtle bg-surface-1 px-6 py-8 sm:px-10 sm:py-10 lg:rounded-l-none">
          <div className="mx-auto w-full max-w-[360px]">
            <div className="mb-8 lg:hidden">
              <Wordmark />
            </div>

            <header>
              <h1 className="text-display">{copy.title}</h1>
              <p className="mt-1.5 text-sm leading-6 text-secondary">{copy.subtitle}</p>
            </header>

            <div
              className="mt-6 mb-6 grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1 shadow-[inset_0_0_0_1px_var(--color-border-default)]"
              role="tablist"
              aria-label="Authentication mode"
            >
              {(['signin', 'signup'] as const).map((value) => {
                const selected = mode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => onModeChange(value)}
                    className={`h-8 rounded-md text-sm font-medium transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      selected
                        ? 'bg-surface-3 text-primary shadow-[inset_0_0_0_1px_var(--color-border-strong)]'
                        : 'text-muted hover:text-primary'
                    }`}
                  >
                    {value === 'signin' ? 'Sign in' : 'Sign up'}
                  </button>
                );
              })}
            </div>

            {clerkLoaded ? (
              <div id="auth-form" className="w-full min-w-0">
                {children}
              </div>
            ) : (
              <div
                className="flex min-h-[248px] items-center justify-center gap-3 text-sm text-secondary"
                role="status"
              >
                <Spinner />
                <span>Loading secure sign-in…</span>
              </div>
            )}

            {clerkTimedOut && (
              <p
                role="alert"
                className="mt-5 rounded-lg border border-border-default bg-surface-2 p-3 text-sm leading-6 text-secondary"
              >
                Sign-in is taking longer than expected. Check your connection, then{' '}
                <button
                  type="button"
                  onClick={onReload}
                  className="font-medium text-primary underline underline-offset-4"
                >
                  reload
                </button>
                .
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
