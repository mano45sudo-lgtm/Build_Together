import { useState } from 'react';
import { Hammer } from 'lucide-react';
import { motion } from 'motion/react';
import { SignIn, SignUp } from '@clerk/electron/react';
import { BrandMarkBackground, SoftLighting } from '../../components/visuals';

type Mode = 'signin' | 'signup';

/**
 * The entry gate. Clerk owns authentication end-to-end (ADR-0006), so this screen mounts Clerk's own
 * prebuilt `<SignIn/>` / `<SignUp/>` components (themed to the Monochrome palette via `ClerkProvider`'s
 * `appearance`). Clerk handles the full flow — credential capture, email-code verification, session
 * activation (`finalize`), and password reset — which is why we no longer hand-roll it: a custom hook
 * flow that forgets to activate the session is exactly what produced "created but signed out".
 *
 * Layout: the brand lockup sits centered above a single elevated card that contains BOTH the mode tabs
 * and the mounted Clerk form. Clerk's own card chrome is stripped in the provider `appearance`, so this
 * surface is the only visible container — the form no longer floats loose on the canvas.
 *
 * The tabs are the single source of truth for which component is mounted; Clerk's own footer cross-links
 * are hidden in the provider `appearance` so there are no dead in-page links. On any successful sign
 * in/up, the active Clerk session is picked up by `AuthProvider`, which syncs a short-lived JWT to the
 * trusted main process and pulls the sanitized `me` view. No token ever appears on this screen.
 */
export function WelcomeScreen() {
  const [mode, setMode] = useState<Mode>('signin');

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-canvas px-6 py-12 text-primary">
      {/* Brand moment: an oversized ghost of the BuildTogether mark in the lower-right negative space,
          with a whisper of top lighting. Decorative only — the auth card sits above it at z-10. */}
      <BrandMarkBackground size={420} className="-right-16 -bottom-16" />
      <SoftLighting position="top" size="70% 60%" />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
        className="relative z-10 w-full max-w-[26rem]"
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

        {/* One contained surface: the tabs and the Clerk form share a single card so the flow reads as
            a cohesive unit. Clerk renders in a shadow root, so its width is driven by the provider
            `appearance.rootBox`/`cardBox`, not by outer Tailwind selectors. */}
        <div className="rounded-xl border border-border-subtle bg-surface-1 p-6 shadow-lg shadow-black/20">
          <div
            className="mb-6 flex gap-1 rounded-lg border border-border-subtle bg-surface-2 p-1"
            role="tablist"
            aria-label="Authentication mode"
          >
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={
                  'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 ' +
                  (mode === m ? 'bg-surface-3 text-primary' : 'text-secondary hover:text-primary')
                }
              >
                {m === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          {/* Clerk renders its own form; hash routing keeps navigation in the URL fragment (no
              server-side path handling), which is what the Electron renderer can serve. */}
          <div className="flex w-full justify-center">
            {mode === 'signup' ? <SignUp routing="hash" /> : <SignIn routing="hash" />}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
