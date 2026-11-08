import { useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/Button';
import { AuthField } from '../AuthField';
import { AuthHeading, TextAction } from '../AuthLayout';
import type { AuthFlow } from '../useAuthFlow';

/** Existing account with a password. Offers an emailed code and a reset as alternatives. */
export function PasswordStep({ flow }: { flow: AuthFlow }) {
  const [password, setPassword] = useState('');
  const busy = flow.pending !== null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void flow.submitPassword(password);
  };

  return (
    <>
      <AuthHeading
        title="Enter your password"
        subtitle={<span className="font-medium text-primary">{flow.email}</span>}
      />
      <form onSubmit={submit} noValidate className="mt-10 space-y-4">
        <AuthField
          id="auth-password"
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="Type your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
          aria-invalid={flow.error ? true : undefined}
          autoFocus
          required
          action={
            <TextAction onClick={() => void flow.startPasswordReset()} disabled={busy}>
              {flow.pending === 'reset' ? 'Sending code…' : 'Forgot password?'}
            </TextAction>
          }
        />
        <Button
          type="submit"
          className="w-full"
          loading={flow.pending === 'submit'}
          disabled={busy || password.length === 0}
        >
          Sign in
        </Button>
      </form>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {flow.codeSignInAvailable ? (
          <TextAction onClick={() => void flow.sendEmailCodeInstead()} disabled={busy}>
            Email me a code instead
          </TextAction>
        ) : null}
        <TextAction onClick={flow.startOver} disabled={busy}>
          Use a different email
        </TextAction>
      </div>
    </>
  );
}
