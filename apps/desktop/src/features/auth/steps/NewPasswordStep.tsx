import { useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/Button';
import { AuthField } from '../AuthField';
import { AuthHeading, TextAction } from '../AuthLayout';
import type { AuthFlow } from '../useAuthFlow';

/** Final password-reset step. */
export function NewPasswordStep({ flow }: { flow: AuthFlow }) {
  const [password, setPassword] = useState('');
  const busy = flow.pending !== null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void flow.submitNewPassword(password);
  };

  return (
    <>
      <AuthHeading title="Choose a new password" subtitle="You'll use it to sign in to CUE." />
      <form onSubmit={submit} noValidate className="mt-10 space-y-4">
        <AuthField
          id="auth-reset-password"
          label="New password"
          type="password"
          autoComplete="new-password"
          placeholder="Create a password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
          autoFocus
          required
        />
        <Button
          type="submit"
          className="w-full"
          loading={flow.pending === 'submit'}
          disabled={busy || password.length === 0}
        >
          Reset password
        </Button>
      </form>
      <div className="mt-6 flex justify-center">
        <TextAction onClick={flow.startOver} disabled={busy}>
          Back to sign in
        </TextAction>
      </div>
    </>
  );
}
