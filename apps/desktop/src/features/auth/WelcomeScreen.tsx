import { useEffect, useState } from 'react';
import { SignIn, SignUp, useAuth as useClerkAuth } from '@clerk/electron/react';
import { AuthLayout, type AuthMode } from './AuthLayout';
import { OAUTH_ACCOUNT_PROMPT } from './clerk-appearance';

/** Clerk's prebuilt components own credential entry, verification and OAuth flows. */
export function WelcomeScreen() {
  const [mode, setMode] = useState<AuthMode>('signin');
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
    <AuthLayout
      mode={mode}
      onModeChange={setMode}
      clerkLoaded={isLoaded}
      clerkTimedOut={clerkTimedOut}
      onReload={() => window.location.reload()}
    >
      {mode === 'signup' ? (
        <SignUp routing="hash" oidcPrompt={OAUTH_ACCOUNT_PROMPT} />
      ) : (
        <SignIn routing="hash" oidcPrompt={OAUTH_ACCOUNT_PROMPT} />
      )}
    </AuthLayout>
  );
}
