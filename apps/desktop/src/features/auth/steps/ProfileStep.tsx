import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Button } from '../../../components/ui/Button';
import { AuthField } from '../AuthField';
import { AuthHeading, TextAction } from '../AuthLayout';
import type { AuthFlow, ProfileValues } from '../useAuthFlow';

/** Only the sign-up fields Clerk reports as missing for this instance are shown. */
export function ProfileStep({ flow }: { flow: AuthFlow }) {
  const [values, setValues] = useState<ProfileValues>({});
  const busy = flow.pending !== null;
  const needs = (field: (typeof flow.missingFields)[number]) => flow.missingFields.includes(field);
  const set = (key: keyof ProfileValues) => (event: ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void flow.submitProfile(values);
  };

  return (
    <>
      <AuthHeading
        title="Finish creating your account"
        subtitle={
          <>
            Signing up as <span className="font-medium text-primary">{flow.email || 'you'}</span>
          </>
        }
      />
      <form onSubmit={submit} noValidate className="mt-10 space-y-4">
        {needs('first_name') || needs('last_name') ? (
          <div className="grid grid-cols-2 gap-3">
            {needs('first_name') ? (
              <AuthField
                id="auth-first-name"
                label="First name"
                autoComplete="given-name"
                value={values.firstName ?? ''}
                onChange={set('firstName')}
                disabled={busy}
                autoFocus
                required
              />
            ) : null}
            {needs('last_name') ? (
              <AuthField
                id="auth-last-name"
                label="Last name"
                autoComplete="family-name"
                value={values.lastName ?? ''}
                onChange={set('lastName')}
                disabled={busy}
                required
              />
            ) : null}
          </div>
        ) : null}
        {needs('username') ? (
          <AuthField
            id="auth-username"
            label="Username"
            autoComplete="username"
            value={values.username ?? ''}
            onChange={set('username')}
            disabled={busy}
            required
          />
        ) : null}
        {needs('password') ? (
          <AuthField
            id="auth-new-password"
            label="Password"
            type="password"
            autoComplete="new-password"
            placeholder="Create a password"
            value={values.password ?? ''}
            onChange={set('password')}
            disabled={busy}
            required
          />
        ) : null}
        <Button
          type="submit"
          className="w-full"
          loading={flow.pending === 'submit'}
          disabled={busy}
        >
          Create account
        </Button>
      </form>
      <div className="mt-6 flex justify-center">
        <TextAction onClick={flow.startOver} disabled={busy}>
          Start over
        </TextAction>
      </div>
    </>
  );
}
