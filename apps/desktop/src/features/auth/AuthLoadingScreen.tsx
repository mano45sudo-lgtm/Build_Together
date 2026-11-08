import { Hammer } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { AuthPhase } from '../../state/AuthProvider';

const MESSAGES: Record<AuthPhase, string> = {
  restoring: 'Starting CUE…',
  verifying: 'Signing you in…',
  workspace: 'Loading your workspace…',
};

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/**
 * Full-window loading state while authentication settles (session restore, token hand-off, workspace
 * load). The one moving element is a light arc tracing the CUE mark; the status line reports the
 * real phase from AuthProvider, never a timed script. Reduced motion gets the same layout, static.
 */
export function AuthLoadingScreen({ phase }: { phase: AuthPhase }) {
  const reduceMotion = useReducedMotion();
  const message = MESSAGES[phase];

  return (
    <main
      className="flex h-full min-h-0 w-full flex-col items-center justify-center bg-canvas text-primary"
      aria-busy="true"
    >
      <motion.div
        className="flex flex-col items-center"
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
      >
        <div className="relative grid size-16 place-items-center">
          {/* Track + travelling arc: a hairline ring with one bright segment orbiting the mark. */}
          <svg viewBox="0 0 64 64" className="absolute inset-0 size-full" aria-hidden="true">
            <circle
              cx="32"
              cy="32"
              r="30"
              fill="none"
              stroke="var(--color-border-default)"
              strokeWidth="1"
            />
          </svg>
          <motion.svg
            viewBox="0 0 64 64"
            className="absolute inset-0 size-full"
            aria-hidden="true"
            animate={reduceMotion ? { rotate: 0 } : { rotate: 360 }}
            transition={{ duration: 1.4, ease: 'linear', repeat: Infinity }}
          >
            <circle
              cx="32"
              cy="32"
              r="30"
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray="34 155"
            />
          </motion.svg>
          <span className="grid size-11 place-items-center rounded-xl border border-border-default bg-surface-1">
            <Hammer className="size-5 text-primary" strokeWidth={1.8} aria-hidden="true" />
          </span>
        </div>

        <p className="mt-6 text-sm font-semibold tracking-[0.08em]">CUE</p>

        <div className="relative mt-2 h-5 w-64 text-center" role="status" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={message}
              className="absolute inset-x-0 text-sm text-secondary"
              initial={reduceMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
            >
              {message}
            </motion.p>
          </AnimatePresence>
        </div>

        <div
          className="mt-6 h-px w-40 overflow-hidden rounded-full bg-border-default"
          aria-hidden="true"
        >
          {reduceMotion ? null : (
            <motion.div
              className="h-full w-1/3 rounded-full bg-primary/70"
              initial={{ x: '-100%' }}
              animate={{ x: '300%' }}
              transition={{ duration: 1.2, ease: [0.65, 0, 0.35, 1], repeat: Infinity }}
            />
          )}
        </div>
      </motion.div>
    </main>
  );
}
