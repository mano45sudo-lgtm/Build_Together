import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../../../components/ui/Button';
import { AuthField } from '../AuthField';
import { AuthHeading, TextAction } from '../AuthLayout';
import type { AuthFlow } from '../useAuthFlow';

interface CodeStepProps {
  flow: AuthFlow;
  title: string;
  subtitle: ReactNode;
  label?: string;
  onSubmit: (code: string) => Promise<void>;
  /** Hidden for authenticator-app codes, which are not sent. */
  canResend?: boolean;
  secondaryAction?: ReactNode;
}

/** One-time code entry, shared by email verification, password reset and two-step checks. */
export function CodeStep({
  flow,
  title,
  subtitle,
  label = 'Verification code',
  onSubmit,
  canResend = true,
  secondaryAction,
}: CodeStepProps) {
  const [code, setCode] = useState('');
  const busy = flow.pending !== null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit(code);
  };

  return (
    <>
      <AuthHeading title={title} subtitle={subtitle} />
      <form onSubmit={submit} noValidate className="mt-10 space-y-4">
        <AuthField
          id="auth-code"
          label={label}
          name="code"
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={8}
          placeholder="Enter the 6-digit code"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          className="tabular-nums tracking-[0.2em] placeholder:tracking-normal"
          disabled={busy}
          aria-invalid={flow.error ? true : undefined}
          autoFocus
          required
        />
        <Button
          type="submit"
          className="w-full"
          loading={flow.pending === 'submit'}
          disabled={busy || code.length < 6}
        >
          Continue
        </Button>
      </form>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {canResend ? (
          <TextAction onClick={() => void flow.resendCode()} disabled={busy}>
            {flow.pending === 'resend' ? 'Sending…' : 'Resend code'}
          </TextAction>
        ) : null}
        {secondaryAction}
        <TextAction onClick={flow.startOver} disabled={busy}>
          Use a different email
        </TextAction>
      </div>
    </>
  );
}
