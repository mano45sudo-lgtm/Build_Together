import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WelcomeScreen } from '../features/auth/WelcomeScreen';
import { OAUTH_ACCOUNT_PROMPT } from '../features/auth/oauth';
import { clerkApiError, clerkResources, setClerkLoaded } from './clerk';

/**
 * The custom auth screens drive Clerk's hooks (mocked in setup.ts). Cases:
 *  - happy: Google (account chooser forced), email code sign-in, password sign-in, sign-up with
 *    verification + required profile fields, password reset, authenticator-app second factor.
 *  - error: invalid email, wrong code, Google failure.
 *  - edge: Clerk still loading, "Use a different email" resets both resources.
 */

const ok = { error: null };

function typeInto(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function submitEmail(email = 'ada@example.com') {
  typeInto(/^email$/i, email);
  fireEvent.click(screen.getByRole('button', { name: /continue with email/i }));
}

async function enterCode(code = '123456', button: RegExp = /^continue$/i) {
  fireEvent.change(await screen.findByLabelText(/code/i), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: button }));
}

describe('auth entry screen', () => {
  it('renders the single-column entry: Google, then email', () => {
    render(<WelcomeScreen />);
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome to CUE' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeEnabled();
    expect(screen.getByLabelText(/^email$/i)).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByRole('button', { name: /continue with email/i })).toBeEnabled();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('disables actions until Clerk has loaded', () => {
    setClerkLoaded(false);
    render(<WelcomeScreen />);
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /continue with email/i })).toBeDisabled();
    expect(screen.getByText(/connecting to secure sign-in/i)).toBeInTheDocument();
  });

  it('rejects an invalid email without calling Clerk', async () => {
    render(<WelcomeScreen />);
    submitEmail('not-an-email');
    expect(await screen.findByRole('alert')).toHaveTextContent(/valid email/i);
    expect(clerkResources().signIn.create).not.toHaveBeenCalled();
  });
});

describe('Google sign-in', () => {
  it('uses the Electron OAuth transport and forces the account chooser', async () => {
    render(<WelcomeScreen />);
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    const redirect = clerkResources().clerk.client.signIn.authenticateWithRedirect;
    await waitFor(() => expect(redirect).toHaveBeenCalledTimes(1));
    expect(redirect.mock.calls[0]![0]).toMatchObject({
      strategy: 'oauth_google',
      oidcPrompt: OAUTH_ACCOUNT_PROMPT,
    });
  });

  it('shows a readable error when the browser flow fails', async () => {
    clerkResources().clerk.client.signIn.authenticateWithRedirect.mockRejectedValue(
      new Error('Clerk: OAuth callback timed out.'),
    );
    render(<WelcomeScreen />);
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/google sign-in didn.t finish/i);
  });
});

describe('email sign-in', () => {
  it('signs in with an emailed code', async () => {
    const { signIn } = clerkResources();
    signIn.supportedFirstFactors = [{ strategy: 'email_code' }];
    signIn.emailCode.verifyCode.mockImplementation(async () => {
      signIn.status = 'complete';
      return ok;
    });
    render(<WelcomeScreen />);
    submitEmail();

    expect(await screen.findByRole('heading', { name: /check your email/i })).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(signIn.create).toHaveBeenCalledWith({ identifier: 'ada@example.com' });
    expect(signIn.emailCode.sendCode).toHaveBeenCalled();

    await enterCode();
    await waitFor(() => expect(signIn.finalize).toHaveBeenCalled());
    expect(signIn.emailCode.verifyCode).toHaveBeenCalledWith({ code: '123456' });
  });

  it('explains a wrong code and stays on the code step', async () => {
    const { signIn } = clerkResources();
    signIn.supportedFirstFactors = [{ strategy: 'email_code' }];
    signIn.emailCode.verifyCode.mockResolvedValue({ error: clerkApiError('form_code_incorrect') });
    render(<WelcomeScreen />);
    submitEmail();
    await enterCode('000000');
    expect(await screen.findByRole('alert')).toHaveTextContent(/code is incorrect/i);
    expect(signIn.finalize).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: /check your email/i })).toBeInTheDocument();
  });

  it('signs in with a password when the account has one', async () => {
    const { signIn } = clerkResources();
    signIn.supportedFirstFactors = [{ strategy: 'password' }, { strategy: 'email_code' }];
    signIn.password.mockImplementation(async () => {
      signIn.status = 'complete';
      return ok;
    });
    render(<WelcomeScreen />);
    submitEmail();

    expect(
      await screen.findByRole('heading', { name: /enter your password/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /email me a code instead/i })).toBeInTheDocument();
    typeInto(/^password$/i, 'correct horse');
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() => expect(signIn.finalize).toHaveBeenCalled());
    expect(signIn.password).toHaveBeenCalledWith({
      identifier: 'ada@example.com',
      password: 'correct horse',
    });
  });

  it('resets a forgotten password and signs in', async () => {
    const { signIn } = clerkResources();
    signIn.supportedFirstFactors = [{ strategy: 'password' }];
    signIn.resetPasswordEmailCode.verifyCode.mockImplementation(async () => {
      signIn.status = 'needs_new_password';
      return ok;
    });
    signIn.resetPasswordEmailCode.submitPassword.mockImplementation(async () => {
      signIn.status = 'complete';
      return ok;
    });
    render(<WelcomeScreen />);
    submitEmail();
    fireEvent.click(await screen.findByRole('button', { name: /forgot password/i }));

    expect(
      await screen.findByRole('heading', { name: /reset your password/i }),
    ).toBeInTheDocument();
    await enterCode();
    expect(
      await screen.findByRole('heading', { name: /choose a new password/i }),
    ).toBeInTheDocument();
    typeInto(/new password/i, 'a brand new secret');
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));
    await waitFor(() => expect(signIn.finalize).toHaveBeenCalled());
    expect(signIn.resetPasswordEmailCode.submitPassword).toHaveBeenCalledWith({
      password: 'a brand new secret',
    });
  });

  it('completes an authenticator-app second factor', async () => {
    const { signIn } = clerkResources();
    signIn.supportedFirstFactors = [{ strategy: 'password' }];
    signIn.supportedSecondFactors = [{ strategy: 'totp' }];
    signIn.password.mockImplementation(async () => {
      signIn.status = 'needs_second_factor';
      return ok;
    });
    signIn.mfa.verifyTOTP.mockImplementation(async () => {
      signIn.status = 'complete';
      return ok;
    });
    render(<WelcomeScreen />);
    submitEmail();
    const signInButton = await screen.findByRole('button', { name: /^sign in$/i });
    typeInto(/^password$/i, 'secret');
    fireEvent.click(signInButton);

    expect(
      await screen.findByRole('heading', { name: /two-step verification/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resend code/i })).not.toBeInTheDocument();
    await enterCode('654321');
    await waitFor(() => expect(signIn.finalize).toHaveBeenCalled());
    expect(signIn.mfa.verifyTOTP).toHaveBeenCalledWith({ code: '654321' });
  });

  it('returns to the entry step and resets Clerk state on "Use a different email"', async () => {
    const { signIn, signUp } = clerkResources();
    signIn.supportedFirstFactors = [{ strategy: 'email_code' }];
    render(<WelcomeScreen />);
    submitEmail();
    fireEvent.click(await screen.findByRole('button', { name: /use a different email/i }));
    expect(screen.getByRole('heading', { name: 'Welcome to CUE' })).toBeInTheDocument();
    expect(signIn.reset).toHaveBeenCalled();
    expect(signUp.reset).toHaveBeenCalled();
  });
});

describe('email sign-up', () => {
  it('creates an account: verify email, then fill the fields Clerk requires', async () => {
    const { signIn, signUp } = clerkResources();
    signIn.create.mockResolvedValue({ error: clerkApiError('form_identifier_not_found') });
    signUp.unverifiedFields = ['email_address'];
    signUp.verifications.verifyEmailCode.mockImplementation(async () => {
      signUp.unverifiedFields = [];
      signUp.missingFields = ['first_name', 'last_name'];
      return ok;
    });
    signUp.update.mockImplementation(async () => {
      signUp.missingFields = [];
      signUp.status = 'complete';
      return ok;
    });
    render(<WelcomeScreen />);
    submitEmail('new@example.com');

    expect(await screen.findByText(/to create your account/i)).toBeInTheDocument();
    expect(signUp.create).toHaveBeenCalledWith({ emailAddress: 'new@example.com' });
    expect(signUp.verifications.sendEmailCode).toHaveBeenCalled();

    await enterCode();
    expect(
      await screen.findByRole('heading', { name: /finish creating your account/i }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    typeInto(/first name/i, 'Grace');
    typeInto(/last name/i, 'Hopper');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(signUp.finalize).toHaveBeenCalled());
    expect(signUp.update).toHaveBeenCalledWith({ firstName: 'Grace', lastName: 'Hopper' });
  });

  it('collects a password when the instance requires one', async () => {
    const { signIn, signUp } = clerkResources();
    signIn.create.mockResolvedValue({ error: clerkApiError('form_identifier_not_found') });
    signUp.missingFields = ['password'];
    signUp.password.mockImplementation(async () => {
      signUp.status = 'complete';
      return ok;
    });
    render(<WelcomeScreen />);
    submitEmail('new@example.com');

    const createButton = await screen.findByRole('button', { name: /create account/i });
    typeInto(/^password$/i, 'long enough secret');
    fireEvent.click(createButton);
    await waitFor(() => expect(signUp.finalize).toHaveBeenCalled());
    expect(signUp.password).toHaveBeenCalledWith({ password: 'long enough secret' });
  });
});

describe('explicit sign-up mode', () => {
  it('switches to "Create your CUE account" and signs up without trying sign-in', async () => {
    const { signIn, signUp } = clerkResources();
    signUp.unverifiedFields = ['email_address'];
    render(<WelcomeScreen />);
    fireEvent.click(screen.getByRole('button', { name: /^sign up$/i }));

    expect(
      screen.getByRole('heading', { level: 1, name: /create your cue account/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign up with google/i })).toBeInTheDocument();
    typeInto(/^email$/i, 'new@example.com');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/to create your account/i)).toBeInTheDocument();
    expect(signUp.create).toHaveBeenCalledWith({ emailAddress: 'new@example.com' });
    expect(signIn.create).not.toHaveBeenCalled();
  });

  it('points an existing account back to sign in', async () => {
    const { signUp } = clerkResources();
    signUp.create.mockResolvedValue({ error: clerkApiError('form_identifier_exists') });
    render(<WelcomeScreen />);
    fireEvent.click(screen.getByRole('button', { name: /^sign up$/i }));
    typeInto(/^email$/i, 'ada@example.com');
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists.*sign in instead/i);
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome to CUE' })).toBeInTheDocument();
  });
});

describe('pending Clerk session (session tasks)', () => {
  function pendingSession(key = 'choose-organization') {
    return { status: 'pending', id: 'sess_1', currentTask: { key }, reload: async () => undefined };
  }

  it('explains a forced-organization task after sign-up instead of staying on the form', async () => {
    const resources = clerkResources();
    const { signIn, signUp, clerk } = resources;
    signIn.create.mockResolvedValue({ error: clerkApiError('form_identifier_not_found') });
    signUp.missingFields = ['password'];
    signUp.password.mockImplementation(async () => {
      signUp.status = 'complete';
      return ok;
    });
    signUp.finalize.mockImplementation(async () => {
      clerk.session = pendingSession();
      return ok;
    });
    render(<WelcomeScreen />);
    submitEmail('new@example.com');
    const createButton = await screen.findByRole('button', { name: /create account/i });
    typeInto(/^password$/i, 'long enough secret');
    fireEvent.click(createButton);

    expect(await screen.findByRole('heading', { name: /one more step/i })).toBeInTheDocument();
    expect(screen.getByText(/membership required/i)).toBeInTheDocument();
  });

  it('shows the task on launch when a pending session already exists, and signs it out', async () => {
    const { clerk } = clerkResources();
    clerk.session = pendingSession();
    render(<WelcomeScreen />);
    expect(await screen.findByRole('heading', { name: /one more step/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /sign out and start over/i }));
    await waitFor(() => expect(clerk.signOut).toHaveBeenCalled());
    expect(await screen.findByRole('heading', { name: 'Welcome to CUE' })).toBeInTheDocument();
  });

  it('treats "already signed in" as the pending session, not an error', async () => {
    const { signIn, clerk } = clerkResources();
    signIn.create.mockImplementation(async () => {
      clerk.session = pendingSession();
      return { error: clerkApiError('session_exists', "You're already signed in.") };
    });
    render(<WelcomeScreen />);
    submitEmail();
    expect(await screen.findByRole('heading', { name: /one more step/i })).toBeInTheDocument();
    expect(screen.queryByText(/already signed in/i)).not.toBeInTheDocument();
  });
});
