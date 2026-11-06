import { useEffect, useState } from 'react';
import { Hammer } from 'lucide-react';
import { motion } from 'motion/react';
import { SignIn, SignUp, useAuth as useClerkAuth } from '@clerk/electron/react';
import { Spinner } from '../../components/ui/Spinner';
import { BrandMarkBackground, SoftLighting } from '../../components/visuals';

type Mode = 'signin' | 'signup';

/** Clerk's prebuilt components own credential entry, verification and OAuth flows. */
export function WelcomeScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const { isLoaded } = useClerkAuth();
  const [clerkTimedOut, setClerkTimedOut] = useState(false);

  useEffect(() => {
    if (isLoaded) {
      setClerkTimedOut(false);
      return;
    }
    const timeout = window.setTimeout(() => setClerkTimedOut(true), 12_000);
    return () => window.clearTimeout(timeout);
  }, [isLoaded]);

  return (
    <main className="relative min-h-screen w-full overflow-y-auto bg-canvas text-primary">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <BrandMarkBackground size={420} className="-right-16 -bottom-16" />
        <SoftLighting position="top" size="70% 60%" />
      </div>
      <div className="relative z-10 flex min-h-screen w-full items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
          className="w-full min-w-0 max-w-[26rem]"
        >
          <div className="mb-6 flex items-center justify-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg border border-border-subtle bg-surface-2">
              <Hammer className="size-5 text-accent" aria-hidden="true" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">BuildTogether</div>
              <div className="text-2xs text-muted">From conversation to completion.</div>
            </div>
          </div>

          <section className="w-full min-w-0 rounded-xl border border-border-subtle bg-surface-1 p-5 shadow-lg shadow-black/20 sm:p-6">
            {isLoaded ? <>
              <div className="mb-6 flex gap-1 rounded-lg border border-border-subtle bg-surface-2 p-1" role="tablist" aria-label="Authentication mode">
                {(['signin', 'signup'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={mode === value}
                    onClick={() => setMode(value)}
                    className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${mode === value ? 'bg-surface-3 text-primary' : 'text-secondary hover:text-primary'}`}
                  >
                    {value === 'signin' ? 'Sign in' : 'Sign up'}
                  </button>
                ))}
              </div>
              <div className="flex w-full min-w-0 justify-center overflow-hidden">
                {mode === 'signup' ? <SignUp routing="hash" /> : <SignIn routing="hash" />}
              </div>
            </> : <div className="flex min-h-[320px] items-center justify-center gap-3 text-sm text-secondary" role="status">
              <Spinner />
              <span>Loading secure sign-in…</span>
            </div>}
          </section>

          {clerkTimedOut && <p role="alert" className="mt-4 rounded-lg border border-border-default bg-surface-1 p-3 text-sm text-secondary">
            Clerk is taking longer than expected. Check the allowed renderer origins in Clerk Dashboard, then{' '}
            <button type="button" onClick={() => window.location.reload()} className="font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">reload</button>.
          </p>}
        </motion.div>
      </div>
    </main>
  );
}
