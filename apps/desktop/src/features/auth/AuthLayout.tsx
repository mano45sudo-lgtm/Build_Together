import type { ReactNode } from 'react';
import { Sun } from 'lucide-react';
import { Spinner } from '../../components/ui/Spinner';

export type AuthMode = 'signin' | 'signup';

interface AuthLayoutProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  clerkLoaded: boolean;
  clerkTimedOut: boolean;
  onReload: () => void;
  children: ReactNode;
}

/** Reference-led presentation shell; Clerk owns the credential, verification and OAuth flows. */
export function AuthLayout({
  mode,
  onModeChange,
  clerkLoaded,
  clerkTimedOut,
  onReload,
  children,
}: AuthLayoutProps) {
  return (
    <main className="flex min-h-screen w-full items-center justify-center overflow-y-auto bg-canvas p-5 font-sans text-primary sm:p-8">
      <div className="grid min-w-0 w-full max-w-[820px] grid-cols-[minmax(0,1fr)] overflow-y-auto rounded-xl border border-border-default bg-surface-1 shadow-[0_16px_40px_rgba(0,0,0,0.36)] md:max-h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
        <section
          className="relative flex min-h-[128px] min-w-0 flex-col justify-between overflow-hidden bg-[#090909] px-6 py-5 text-primary sm:px-8 sm:py-6 lg:min-h-[440px]"
          aria-label="CUE"
        >
          <div
            className="pointer-events-none absolute inset-0 flex justify-center"
            aria-hidden="true"
          >
            <span className="h-full w-[7%] bg-gradient-to-b from-[#090909] via-[#111111] to-[#1c1c1c] opacity-70" />
            <span className="h-full w-[7%] bg-gradient-to-b from-[#090909] via-[#171717] to-[#2a2a2a] opacity-75" />
            <span className="h-full w-[7%] bg-gradient-to-b from-[#090909] via-[#141414] to-[#252525] opacity-80" />
            <span className="h-full w-[7%] bg-gradient-to-b from-[#090909] via-[#111111] to-[#1c1c1c] opacity-75" />
            <span className="h-full w-[7%] bg-gradient-to-b from-[#090909] via-[#171717] to-[#101010] opacity-80" />
          </div>
          <div
            className="pointer-events-none absolute -bottom-20 -left-8 h-44 w-44 rounded-full bg-[radial-gradient(circle_at_36%_38%,#666666_0%,#3a3a3a_28%,#1c1c1c_62%,#0a0a0a_76%,transparent_77%)]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-1 -left-2 h-12 w-24 rounded-full bg-gradient-to-br from-[#a1a1aa]/80 via-[#52525b]/70 to-[#27272a]/80"
            aria-hidden="true"
          />
          <div className="relative z-10 flex w-full flex-col justify-between gap-8">
            <p className="text-base font-semibold tracking-tight">CUE</p>
            <h1 className="max-w-xs text-xl font-medium leading-tight tracking-tight sm:text-2xl">
              From conversation to
              <br />
              completion.
            </h1>
          </div>
        </section>

        <section className="flex min-w-0 max-w-full flex-col justify-center overflow-x-hidden px-5 py-6 sm:px-8 sm:py-8">
          <header className="mb-5">
            <Sun className="mb-4 size-7 text-primary" strokeWidth={1.8} aria-hidden="true" />
            <h2 className="text-xl font-medium leading-tight tracking-tight sm:text-2xl">
              {mode === 'signup' ? 'Get Started' : 'Welcome back'}
            </h2>
            <p className="mt-1.5 text-sm leading-5 text-secondary">
              {mode === 'signup'
                ? "Welcome to CUE — let's get started"
                : 'Sign in to continue to CUE'}
            </p>
          </header>

          <div
            className="mb-4 flex rounded-lg border border-border-default bg-surface-2 p-1"
            role="tablist"
            aria-label="Authentication mode"
          >
            {(['signin', 'signup'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => onModeChange(value)}
                className={`min-h-9 flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2 ${mode === value ? 'bg-surface-3 text-primary' : 'text-secondary hover:text-primary'}`}
              >
                {value === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          {clerkLoaded ? (
            <div className="flex w-full min-w-0 max-w-full justify-center overflow-visible">
              {children}
            </div>
          ) : (
            <div
              className="flex min-h-[240px] items-center justify-center gap-3 text-sm text-secondary"
              role="status"
            >
              <Spinner />
              <span>Loading secure sign-in…</span>
            </div>
          )}

          {clerkTimedOut && (
            <p
              role="alert"
              className="mt-4 rounded-md border border-border-default bg-surface-2 p-3 text-sm leading-6 text-primary"
            >
              Clerk is taking longer than expected. Check the allowed renderer origins in Clerk
              Dashboard, then{' '}
              <button
                type="button"
                onClick={onReload}
                className="font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                reload
              </button>
              .
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
