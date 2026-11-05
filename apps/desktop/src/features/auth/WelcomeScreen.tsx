import { useState } from 'react';
import { Hammer } from 'lucide-react';
import { motion } from 'motion/react';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { BrandMarkBackground, SoftLighting } from '../../components/visuals';
import { errorMessage } from '../../lib/bridge';
import { useAuth } from '../../state/AuthProvider';

type Mode = 'signin' | 'signup';

/**
 * The entry gate: sign in or create an account. It is deliberately calm and single-column — the
 * desktop chrome, not a marketing page. Field-level failures from the server (validation details)
 * surface inline; anything else becomes one clear banner naming the problem. No tokens ever appear
 * here — submitting hands off to the trusted main process via the bridge.
 */
export function WelcomeScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const isSignup = mode === 'signup';

  const resetErrors = () => {
    setBanner(null);
    setFieldErrors({});
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    resetErrors();
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    resetErrors();
    setSubmitting(true);
    try {
      if (isSignup) await signUp({ name: name.trim(), email: email.trim(), password });
      else await signIn({ email: email.trim(), password });
      // On success AuthProvider flips to signed-in and the shell remounts; nothing else to do.
    } catch (error) {
      const details = (error as { details?: Record<string, string[]> }).details;
      if (details) setFieldErrors(details);
      setBanner(errorMessage(error));
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-canvas px-6 py-12 text-primary">
      {/* Brand moment: an oversized ghost of the actual BuildTogether mark in the lower-right negative
          space, with a whisper of top lighting. Decorative only — the form sits above it at z-10. */}
      <BrandMarkBackground size={420} className="-right-16 -bottom-16" />
      <SoftLighting position="top" size="70% 60%" />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
        className="relative z-10 w-full max-w-sm"
      >
        <div className="mb-8 flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg border border-border-subtle bg-surface-2">
            <Hammer className="size-5 text-accent" aria-hidden="true" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">BuildTogether</div>
            <div className="text-2xs text-muted">From conversation to completion.</div>
          </div>
        </div>

        <h1 className="text-display">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mt-1.5 text-sm text-secondary">
          {isSignup
            ? 'Set up your identity to start building with your team.'
            : 'Sign in to pick up where you left off.'}
        </p>

        <div
          className="mt-6 flex gap-1 rounded-lg border border-border-subtle bg-surface-1 p-1"
          role="tablist"
        >
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={
                'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 ' +
                (mode === m ? 'bg-surface-3 text-primary' : 'text-secondary hover:text-primary')
              }
            >
              {m === 'signin' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          {banner ? <Alert variant="error">{banner}</Alert> : null}

          {isSignup ? (
            <Field label="Full name" htmlFor="name" required error={fieldErrors['name']?.[0]}>
              <Input
                id="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
              />
            </Field>
          ) : null}

          <Field label="Email" htmlFor="email" required error={fieldErrors['email']?.[0]}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@studio.com"
            />
          </Field>

          <Field
            label="Password"
            htmlFor="password"
            required
            error={fieldErrors['password']?.[0]}
            hint={isSignup ? 'At least 10 characters.' : undefined}
          >
            <Input
              id="password"
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••"
            />
          </Field>

          <Button type="submit" className="w-full" loading={submitting}>
            {isSignup ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          {isSignup ? 'Already have an account? ' : 'New to BuildTogether? '}
          <button
            type="button"
            className="font-medium text-secondary underline-offset-2 hover:text-primary hover:underline"
            onClick={() => switchMode(isSignup ? 'signin' : 'signup')}
          >
            {isSignup ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
