import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { AuthHeading } from '../AuthLayout';
import type { AuthFlow, SessionTaskKey } from '../useAuthFlow';

/**
 * What each Clerk session task means here. Cue keeps its own workspaces, so none of these can be
 * completed inside the app; in development we name the Clerk Dashboard setting that causes it.
 */
const TASK_COPY: Record<SessionTaskKey, { production: string; development: string }> = {
  'choose-organization': {
    production:
      'Your account was created, but sign-in needs an organization step Cue doesn’t support yet. Contact your workspace admin.',
    development:
      'Clerk is set to require an organization for every session, but Cue uses its own workspaces. In Clerk Dashboard → Organizations, turn off “Membership required” (force organization selection), then sign out and sign in again.',
  },
  'reset-password': {
    production:
      'Your password must be reset before you can continue. Sign out, then use “Forgot password?” to choose a new one.',
    development:
      'Clerk requires this account to reset its password. Sign out, then use “Forgot password?” on the sign-in screen.',
  },
  'setup-mfa': {
    production:
      'Your account must set up two-step verification, which Cue doesn’t support yet. Contact your workspace admin.',
    development:
      'Clerk requires MFA setup for this session, which Cue’s auth screens don’t handle. Turn off required MFA in Clerk Dashboard, or add a setup step.',
  },
};

const UNKNOWN_TASK =
  'Your account needs one more setup step that Cue doesn’t support yet. Sign out and try again, or contact your workspace admin.';

export function SessionTaskStep({ flow }: { flow: AuthFlow }) {
  const busy = flow.pending !== null;
  const copy = flow.sessionTask ? TASK_COPY[flow.sessionTask] : null;
  const message = copy ? (import.meta.env.DEV ? copy.development : copy.production) : UNKNOWN_TASK;

  return (
    <>
      <AuthHeading
        title="One more step"
        subtitle="You’re signed in with Clerk, but Cue can’t open your session yet."
      />
      <Alert variant="info" className="mt-8">
        {message}
      </Alert>
      <div className="mt-6 space-y-3">
        <Button
          className="w-full"
          onClick={() => void flow.signOutPendingSession()}
          loading={flow.pending === 'submit'}
          disabled={busy}
        >
          Sign out and start over
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => void flow.recheckSession()}
          disabled={busy}
        >
          Check again
        </Button>
      </div>
    </>
  );
}
