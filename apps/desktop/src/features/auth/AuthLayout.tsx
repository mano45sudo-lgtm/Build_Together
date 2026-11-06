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
    <main className="flex min-h-screen w-full items-center justify-center overflow-y-auto bg-[#090909] p-4 text-[#f5f5f5] sm:p-8">
      <div className="grid w-full max-w-[860px] overflow-hidden rounded-xl border border-[#252525] bg-[#111111] shadow-[0_20px_56px_rgba(0,0,0,0.42)] md:min-h-[500px] md:grid-cols-[0.92fr_1.08fr]">
        <section
          className="relative flex min-h-[150px] overflow-hidden bg-black px-6 py-6 text-white sm:px-8 sm:py-8 md:min-h-[500px]"
          aria-label="CUE"
        >
          <div
            className="pointer-events-none absolute inset-0 flex justify-center"
            aria-hidden="true"
          >
            <span className="h-full w-[7%] bg-gradient-to-b from-black via-[#111111] to-[#17100a] opacity-80" />
            <span className="h-full w-[7%] bg-gradient-to-b from-[#080808] via-[#17100a] to-[#f07824] opacity-70" />
            <span className="h-full w-[7%] bg-gradient-to-b from-black via-[#17100a] to-[#ff7618] opacity-80" />
            <span className="h-full w-[7%] bg-gradient-to-b from-[#090909] via-[#111111] to-[#080808] opacity-85" />
            <span className="h-full w-[7%] bg-gradient-to-b from-black via-[#17100a] to-[#090909] opacity-80" />
          </div>
          <div
            className="pointer-events-none absolute -bottom-20 -left-8 h-44 w-44 rounded-full bg-[radial-gradient(circle_at_36%_38%,#fff8ed_0%,#ffc086_24%,#f36a16_58%,#7f2f0a_75%,transparent_76%)]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-1 -left-2 h-12 w-24 rounded-full bg-gradient-to-br from-white/80 via-[#ded8d2]/70 to-[#a6a09b]/80"
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

        <section className="flex min-w-0 flex-col justify-center px-6 py-7 sm:px-8 sm:py-8">
          <header className="mb-5">
            <Sun className="mb-4 size-7 text-orange-500" strokeWidth={1.8} aria-hidden="true" />
            <h2 className="text-xl font-medium leading-tight tracking-tight sm:text-2xl">
              {mode === 'signup' ? 'Get Started' : 'Welcome back'}
            </h2>
            <p className="mt-1.5 text-sm leading-5 text-[#a1a1aa]">
              {mode === 'signup'
                ? "Welcome to CUE — let's get started"
                : 'Sign in to continue to CUE'}
            </p>
          </header>

          <div
            className="mb-4 flex rounded-lg border border-[#242424] bg-[#171717] p-1"
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
                className={`min-h-9 flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#171717] ${mode === value ? 'bg-[#242424] text-white' : 'text-[#a1a1aa] hover:text-white'}`}
              >
                {value === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          {clerkLoaded ? (
            <div className="flex w-full min-w-0 justify-center overflow-visible">{children}</div>
          ) : (
            <div
              className="flex min-h-[260px] items-center justify-center gap-3 text-sm text-[#a1a1aa]"
              role="status"
            >
              <Spinner />
              <span>Loading secure sign-in…</span>
            </div>
          )}

          {clerkTimedOut && (
            <p
              role="alert"
              className="mt-4 rounded-md border border-[#493025] bg-[#1c1715] p-3 text-sm leading-6 text-[#f0d2c4]"
            >
              Clerk is taking longer than expected. Check the allowed renderer origins in Clerk
              Dashboard, then{' '}
              <button
                type="button"
                onClick={onReload}
                className="font-medium text-orange-300 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
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
