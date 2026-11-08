import { useCallback, useEffect, useState } from 'react';
import { useClerk, useSignIn, useSignUp } from '@clerk/electron/react';
import { clerkErrorCode, clerkErrorMessage, isClerkApiError } from './clerk-errors';
import { OAUTH_ACCOUNT_PROMPT } from './oauth';

/**
 * Custom sign-in / sign-up state machine on Clerk's hooks (ADR-0006). Clerk still owns every
 * credential: this only decides which step to show and which Clerk method to call next.
 *
 * Email is one entry point for both journeys: `signIn.create` either finds the account (sign in
 * with password or emailed code) or reports `form_identifier_not_found`, which starts a sign-up
 * verified by an emailed code. Google uses the legacy `authenticateWithRedirect`, the only Clerk
 * API that goes through `@clerk/electron`'s system-browser OAuth bridge; `signIn.sso()` would try
 * to navigate the app window instead.
 */

export type AuthStep =
  | 'email' // email + Google
  | 'code' // email verification code (sign-in or sign-up)
  | 'password' // existing account with a password
  | 'second-factor' // MFA or new-device check
  | 'profile' // sign-up fields Clerk still requires
  | 'reset-code' // password reset: emailed code
  | 'reset-password' // password reset: new password
  | 'session-task'; // Clerk session created but "pending" on a task Cue can't complete

export type AuthJourney = 'sign-in' | 'sign-up';
export type ProfileField = 'first_name' | 'last_name' | 'username' | 'password';
export type SecondFactorKind = 'totp' | 'email_code' | 'phone_code';
export type PendingAction = 'google' | 'submit' | 'resend' | 'reset';
/** Clerk session tasks (`session.currentTask.key`); a session with one is `pending`, not signed in. */
export type SessionTaskKey = 'choose-organization' | 'reset-password' | 'setup-mfa';

export interface ProfileValues {
  firstName?: string;
  lastName?: string;
  username?: string;
  password?: string;
}

const PROFILE_FIELDS: readonly ProfileField[] = ['first_name', 'last_name', 'username', 'password'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ClerkResult = { error: unknown };

/** Clerk's future API reports failures as `{ error }` instead of throwing; normalise to throw. */
function ensure(result: ClerkResult): void {
  if (result.error) throw result.error;
}

export function useAuthFlow() {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const clerk = useClerk();

  /** Which entry screen is showing: "Sign in" or "Create account". */
  const [mode, setModeState] = useState<AuthJourney>('sign-in');
  const [step, setStep] = useState<AuthStep>('email');
  const [journey, setJourney] = useState<AuthJourney>('sign-in');
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<ProfileField[]>([]);
  const [secondFactor, setSecondFactor] = useState<SecondFactorKind | null>(null);
  const [codeSignInAvailable, setCodeSignInAvailable] = useState(false);
  const [sessionTask, setSessionTask] = useState<SessionTaskKey | null>(null);

  /**
   * A finished sign-in/up can leave the session `pending` on a Clerk session task (e.g. the instance
   * forces organization selection). Clerk reports that as signed out, so without this check the
   * screen would silently stay put. Returns true when such a session exists.
   */
  const detectPendingSession = useCallback((): boolean => {
    const session = clerk.session;
    if (session?.status !== 'pending') return false;
    setSessionTask((session.currentTask?.key as SessionTaskKey | undefined) ?? null);
    setStep('session-task');
    return true;
  }, [clerk]);

  // A pending session survives restarts, so check on mount as well as after each finish.
  useEffect(() => {
    detectPendingSession();
  }, [detectPendingSession, clerk.loaded]);

  const run = useCallback(
    async (action: PendingAction, task: () => Promise<void>) => {
      setPending(action);
      setError(null);
      setNotice(null);
      try {
        await task();
      } catch (cause) {
        // "You're already signed in": the client already holds a (pending) session.
        if (clerkErrorCode(cause) === 'session_exists' && detectPendingSession()) return;
        setError(clerkErrorMessage(cause));
      } finally {
        setPending(null);
      }
    },
    [detectPendingSession],
  );

  const startSecondFactor = useCallback(async () => {
    const strategies = signIn.supportedSecondFactors.map((factor) => factor.strategy);
    if (strategies.includes('totp')) {
      setSecondFactor('totp');
    } else if (strategies.includes('email_code')) {
      ensure(await signIn.mfa.sendEmailCode());
      setSecondFactor('email_code');
    } else if (strategies.includes('phone_code')) {
      ensure(await signIn.mfa.sendPhoneCode());
      setSecondFactor('phone_code');
    } else {
      throw new Error(
        'This account needs a verification method Cue does not support yet. Contact your workspace admin.',
      );
    }
    setStep('second-factor');
  }, [signIn]);

  /** Route on the sign-in status Clerk returned; `complete` activates the session. */
  const continueSignIn = useCallback(async () => {
    switch (signIn.status) {
      case 'complete':
        ensure(await signIn.finalize());
        detectPendingSession();
        return;
      case 'needs_second_factor':
      case 'needs_client_trust':
        await startSecondFactor();
        return;
      case 'needs_new_password':
        setStep('reset-password');
        return;
      default:
        throw new Error('Sign-in did not finish. Start again with your email.');
    }
  }, [signIn, startSecondFactor, detectPendingSession]);

  /** Route on the sign-up status: verify the email, collect required fields, then activate. */
  const continueSignUp = useCallback(async () => {
    if (signUp.status === 'complete') {
      ensure(await signUp.finalize());
      detectPendingSession();
      return;
    }
    if (signUp.unverifiedFields.includes('email_address')) {
      ensure(await signUp.verifications.sendEmailCode());
      setStep('code');
      return;
    }
    const missing = signUp.missingFields;
    const unsupported = missing.filter((field) => !PROFILE_FIELDS.includes(field as ProfileField));
    if (unsupported.length > 0) {
      throw new Error(
        `Cue can't collect ${unsupported.join(', ').replaceAll('_', ' ')} yet. Contact your workspace admin.`,
      );
    }
    if (missing.length > 0) {
      setMissingFields(missing as ProfileField[]);
      setStep('profile');
      return;
    }
    throw new Error('Sign-up did not finish. Start again with your email.');
  }, [signUp, detectPendingSession]);

  const submitEmail = useCallback(
    (rawEmail: string) =>
      run('submit', async () => {
        const value = rawEmail.trim();
        if (!EMAIL_PATTERN.test(value)) throw new Error('Enter a valid email address.');
        setEmail(value);

        if (mode === 'sign-up') {
          setJourney('sign-up');
          const created = await signUp.create({ emailAddress: value });
          if (clerkErrorCode(created.error) === 'form_identifier_exists') {
            throw new Error('An account already exists for this email. Sign in instead.');
          }
          ensure(created);
          await continueSignUp();
          return;
        }

        // Sign-in mode: an unknown email continues straight into sign-up rather than dead-ending.
        const attempt = await signIn.create({ identifier: value });
        if (attempt.error) {
          if (clerkErrorCode(attempt.error) !== 'form_identifier_not_found') throw attempt.error;
          setJourney('sign-up');
          ensure(await signUp.create({ emailAddress: value }));
          await continueSignUp();
          return;
        }

        setJourney('sign-in');
        const strategies = signIn.supportedFirstFactors.map((factor) => factor.strategy);
        const canUseCode = strategies.includes('email_code');
        setCodeSignInAvailable(canUseCode);
        if (strategies.includes('password')) {
          setStep('password');
        } else if (canUseCode) {
          ensure(await signIn.emailCode.sendCode());
          setStep('code');
        } else {
          throw new Error(
            'This account has no email sign-in method. Continue with Google instead.',
          );
        }
      }),
    [run, mode, signIn, signUp, continueSignUp],
  );

  const submitCode = useCallback(
    (code: string) =>
      run('submit', async () => {
        if (journey === 'sign-up') {
          ensure(await signUp.verifications.verifyEmailCode({ code: code.trim() }));
          await continueSignUp();
        } else {
          ensure(await signIn.emailCode.verifyCode({ code: code.trim() }));
          await continueSignIn();
        }
      }),
    [run, journey, signIn, signUp, continueSignIn, continueSignUp],
  );

  const resendCode = useCallback(
    () =>
      run('resend', async () => {
        if (step === 'reset-code') ensure(await signIn.resetPasswordEmailCode.sendCode());
        else if (step === 'second-factor' && secondFactor === 'email_code')
          ensure(await signIn.mfa.sendEmailCode());
        else if (step === 'second-factor' && secondFactor === 'phone_code')
          ensure(await signIn.mfa.sendPhoneCode());
        else if (journey === 'sign-up') ensure(await signUp.verifications.sendEmailCode());
        else ensure(await signIn.emailCode.sendCode());
        setNotice('We sent a new code.');
      }),
    [run, step, secondFactor, journey, signIn, signUp],
  );

  const sendEmailCodeInstead = useCallback(
    () =>
      run('submit', async () => {
        ensure(await signIn.emailCode.sendCode());
        setStep('code');
      }),
    [run, signIn],
  );

  const submitPassword = useCallback(
    (password: string) =>
      run('submit', async () => {
        ensure(await signIn.password({ identifier: email, password }));
        await continueSignIn();
      }),
    [run, email, signIn, continueSignIn],
  );

  const submitSecondFactor = useCallback(
    (code: string) =>
      run('submit', async () => {
        const value = code.trim();
        if (secondFactor === 'totp') ensure(await signIn.mfa.verifyTOTP({ code: value }));
        else if (secondFactor === 'phone_code')
          ensure(await signIn.mfa.verifyPhoneCode({ code: value }));
        else ensure(await signIn.mfa.verifyEmailCode({ code: value }));
        await continueSignIn();
      }),
    [run, secondFactor, signIn, continueSignIn],
  );

  const submitProfile = useCallback(
    (values: ProfileValues) =>
      run('submit', async () => {
        const names = {
          ...(values.firstName?.trim() ? { firstName: values.firstName.trim() } : {}),
          ...(values.lastName?.trim() ? { lastName: values.lastName.trim() } : {}),
        };
        const username = values.username?.trim();
        if (missingFields.includes('password') && values.password) {
          ensure(
            await signUp.password({
              password: values.password,
              ...names,
              ...(username ? { username } : {}),
            }),
          );
        } else {
          ensure(await signUp.update({ ...names, ...(username ? { username } : {}) }));
        }
        await continueSignUp();
      }),
    [run, missingFields, signUp, continueSignUp],
  );

  const startPasswordReset = useCallback(
    () =>
      run('reset', async () => {
        ensure(await signIn.resetPasswordEmailCode.sendCode());
        setStep('reset-code');
      }),
    [run, signIn],
  );

  const submitResetCode = useCallback(
    (code: string) =>
      run('submit', async () => {
        ensure(await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() }));
        await continueSignIn();
      }),
    [run, signIn, continueSignIn],
  );

  const submitNewPassword = useCallback(
    (password: string) =>
      run('submit', async () => {
        ensure(await signIn.resetPasswordEmailCode.submitPassword({ password }));
        await continueSignIn();
      }),
    [run, signIn, continueSignIn],
  );

  const continueWithGoogle = useCallback(
    () =>
      run('google', async () => {
        const resource = clerk.client?.signIn;
        if (!resource) throw new Error('Sign-in is still loading. Try again in a moment.');
        try {
          // The Electron OAuth transport replaces both URLs with its own deep-link callback.
          await resource.authenticateWithRedirect({
            strategy: 'oauth_google',
            redirectUrl: window.location.href,
            redirectUrlComplete: window.location.href,
            oidcPrompt: OAUTH_ACCOUNT_PROMPT,
          });
        } catch (cause) {
          // Transport failures (timeout, closed browser) carry no useful wording; Clerk API errors do.
          if (isClerkApiError(cause)) throw cause;
          throw new Error(
            "Google sign-in didn't finish. Try again, and complete it in your browser.",
            {
              cause,
            },
          );
        }
        if (clerk.session?.status === 'active') return; // AuthProvider takes over.
        if (detectPendingSession()) return;

        // A first-time Google user whose sign-up still needs fields, or an MFA account.
        if (clerk.client?.signUp.status === 'missing_requirements') {
          setJourney('sign-up');
          await continueSignUp();
          return;
        }
        await continueSignIn();
      }),
    [run, clerk, continueSignIn, continueSignUp, detectPendingSession],
  );

  const setMode = useCallback(
    (next: AuthJourney) => {
      void signIn.reset();
      void signUp.reset();
      setModeState(next);
      setStep('email');
      setError(null);
      setNotice(null);
    },
    [signIn, signUp],
  );

  /** Re-read the pending session; if its task was resolved elsewhere, activate it. */
  const recheckSession = useCallback(
    () =>
      run('submit', async () => {
        const session = clerk.session;
        if (!session) {
          setStep('email');
          return;
        }
        await session.reload();
        if (clerk.session?.status === 'active') {
          await clerk.setActive({ session: clerk.session.id });
          return;
        }
        throw new Error(
          'That step is still required. Sign out, then sign in again once it’s fixed.',
        );
      }),
    [run, clerk],
  );

  /** End the pending session so the user can sign in again (e.g. after the setting is fixed). */
  const signOutPendingSession = useCallback(
    () =>
      run('submit', async () => {
        await clerk.signOut();
        void signIn.reset();
        void signUp.reset();
        setSessionTask(null);
        setStep('email');
      }),
    [run, clerk, signIn, signUp],
  );

  const startOver = useCallback(() => {
    void signIn.reset();
    void signUp.reset();
    setStep('email');
    setJourney('sign-in');
    setError(null);
    setNotice(null);
    setMissingFields([]);
    setSecondFactor(null);
  }, [signIn, signUp]);

  return {
    mode,
    setMode,
    step,
    journey,
    email,
    pending,
    error,
    notice,
    missingFields,
    secondFactor,
    codeSignInAvailable,
    sessionTask,
    recheckSession,
    signOutPendingSession,
    submitEmail,
    submitCode,
    resendCode,
    sendEmailCodeInstead,
    submitPassword,
    submitSecondFactor,
    submitProfile,
    startPasswordReset,
    submitResetCode,
    submitNewPassword,
    continueWithGoogle,
    startOver,
  };
}

export type AuthFlow = ReturnType<typeof useAuthFlow>;
