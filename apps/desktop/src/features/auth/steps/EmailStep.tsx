import { useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/Button';
import { AuthField } from '../AuthField';
import { AuthHeading } from '../AuthLayout';
import { GoogleIcon } from '../GoogleIcon';
import type { AuthFlow } from '../useAuthFlow';

const COPY = {
  'sign-in': {
    title: 'Welcome to CUE',
    subtitle: 'From conversation to completion.',
    google: 'Continue with Google',
    submit: 'Continue with email',
    switchPrompt: "Don't have an account?",
    switchAction: 'Sign up',
  },
  'sign-up': {
    title: 'Create your CUE account',
    subtitle: 'Turn your team’s conversations into finished work.',
    google: 'Sign up with Google',
    submit: 'Create account',
    switchPrompt: 'Already have an account?',
    switchAction: 'Sign in',
  },
} as const;

/** Entry step: Google, a hairline, then email. A link below switches sign in ↔ sign up. */
export function EmailStep({ flow, ready }: { flow: AuthFlow; ready: boolean }) {
  const [email, setEmail] = useState(flow.email);
  const busy = flow.pending !== null;
  const copy = COPY[flow.mode];

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void flow.submitEmail(email);
  };

  return (
    <>
      <AuthHeading title={copy.title} subtitle={copy.subtitle} />

      <Button
        variant="outline"
        className="mt-10 w-full"
        onClick={() => void flow.continueWithGoogle()}
        loading={flow.pending === 'google'}
        disabled={!ready || busy}
      >
        {flow.pending === 'google' ? null : <GoogleIcon className="size-4" />}
        {copy.google}
      </Button>
      {flow.pending === 'google' ? (
        <p role="status" className="mt-3 text-center text-xs leading-5 text-muted">
          Finish in your browser, then come back to CUE.
        </p>
      ) : null}

      <hr className="my-7 border-border-default" />

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <AuthField
          id="auth-email"
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="Type your email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={!ready || busy}
          aria-invalid={flow.error ? true : undefined}
          autoFocus
          required
        />
        <Button
          type="submit"
          className="w-full"
          loading={flow.pending === 'submit'}
          disabled={!ready || busy}
        >
          {copy.submit}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-secondary">
        {copy.switchPrompt}{' '}
        <button
          type="button"
          onClick={() => flow.setMode(flow.mode === 'sign-in' ? 'sign-up' : 'sign-in')}
          disabled={busy}
          className="rounded-sm font-medium text-primary underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-50"
        >
          {copy.switchAction}
        </button>
      </p>
    </>
  );
}
