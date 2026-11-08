import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { AuthHeading, AuthLayout } from './AuthLayout';

interface AuthRecoveryProps {
  message: string;
  onRetry: () => void;
  onSignOut: () => void;
}

/** Shown when Clerk signed the user in but Cue could not finish setting up the session. */
export function AuthRecovery({ message, onRetry, onSignOut }: AuthRecoveryProps) {
  return (
    <AuthLayout>
      <AuthHeading
        title="Couldn’t finish signing in"
        subtitle="Your account is fine. Cue couldn’t load your session."
      />
      <Alert variant="error" className="mt-8">
        {message}
      </Alert>
      <div className="mt-6 space-y-3">
        <Button className="w-full" onClick={onRetry}>
          Try again
        </Button>
        <Button variant="outline" className="w-full" onClick={onSignOut}>
          Return to sign in
        </Button>
      </div>
    </AuthLayout>
  );
}
