import { useEffect, useState } from 'react';
import { useAuth as useClerkAuth } from '@clerk/electron/react';
import { Alert } from '../../components/ui/Alert';
import { AuthLayout, TextAction } from './AuthLayout';
import { useAuthFlow, type AuthFlow } from './useAuthFlow';
import { CodeStep } from './steps/CodeStep';
import { EmailStep } from './steps/EmailStep';
import { NewPasswordStep } from './steps/NewPasswordStep';
import { PasswordStep } from './steps/PasswordStep';
import { ProfileStep } from './steps/ProfileStep';
import { SessionTaskStep } from './steps/SessionTaskStep';

const CLERK_LOAD_TIMEOUT_MS = 12_000;

const SECOND_FACTOR_COPY = {
  totp: {
    title: 'Two-step verification',
    subtitle: 'Enter the code from your authenticator app.',
    label: 'Authentication code',
  },
  email_code: {
    title: 'Check your email',
    subtitle: 'Enter the verification code we sent to confirm it’s you.',
    label: 'Verification code',
  },
  phone_code: {
    title: 'Check your phone',
    subtitle: 'Enter the code we sent to your phone.',
    label: 'Verification code',
  },
} as const;

function Recipient({ email }: { email: string }) {
  return <span className="font-medium text-primary">{email}</span>;
}

function CurrentStep({ flow, ready }: { flow: AuthFlow; ready: boolean }) {
  switch (flow.step) {
    case 'email':
      return <EmailStep flow={flow} ready={ready} />;
    case 'password':
      return <PasswordStep flow={flow} />;
    case 'code':
      return (
        <CodeStep
          flow={flow}
          title="Check your email"
          subtitle={
            <>
              {flow.journey === 'sign-up' ? 'To create your account, enter' : 'Enter'} the code we
              sent to <Recipient email={flow.email} />
            </>
          }
          onSubmit={flow.submitCode}
        />
      );
    case 'reset-code':
      return (
        <CodeStep
          flow={flow}
          title="Reset your password"
          subtitle={
            <>
              Enter the code we sent to <Recipient email={flow.email} />
            </>
          }
          onSubmit={flow.submitResetCode}
        />
      );
    case 'second-factor': {
      const copy = SECOND_FACTOR_COPY[flow.secondFactor ?? 'email_code'];
      return (
        <CodeStep
          flow={flow}
          title={copy.title}
          subtitle={copy.subtitle}
          label={copy.label}
          onSubmit={flow.submitSecondFactor}
          canResend={flow.secondFactor !== 'totp'}
        />
      );
    }
    case 'profile':
      return <ProfileStep flow={flow} />;
    case 'reset-password':
      return <NewPasswordStep flow={flow} />;
    case 'session-task':
      return <SessionTaskStep flow={flow} />;
  }
}

/** Custom auth screens on Clerk's hooks; Clerk still owns every credential and session. */
export function WelcomeScreen() {
  const { isLoaded } = useClerkAuth();
  const flow = useAuthFlow();
  const [clerkTimedOut, setClerkTimedOut] = useState(false);

  useEffect(() => {
    if (isLoaded) {
      setClerkTimedOut(false);
      return;
    }
    const timeout = window.setTimeout(() => setClerkTimedOut(true), CLERK_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [isLoaded]);

  return (
    <AuthLayout
      footer={
        clerkTimedOut ? (
          <p role="alert" className="text-sm leading-6 text-secondary">
            Sign-in is taking longer than expected. Check your connection, then{' '}
            <TextAction onClick={() => window.location.reload()}>reload</TextAction>.
          </p>
        ) : !isLoaded ? (
          <p role="status" className="text-sm text-muted">
            Connecting to secure sign-in…
          </p>
        ) : null
      }
    >
      <CurrentStep flow={flow} ready={isLoaded} />
      {flow.error ? (
        <Alert variant="error" className="mt-5">
          {flow.error}
        </Alert>
      ) : null}
      {flow.notice ? (
        <p role="status" className="mt-4 text-center text-sm text-secondary">
          {flow.notice}
        </p>
      ) : null}
    </AuthLayout>
  );
}
