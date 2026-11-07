import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { createElement } from 'react';

// Keep the ApiStatusIndicator from opening a real socket during unit tests.
globalThis.fetch = vi.fn(() =>
  Promise.reject(new Error('offline (test)')),
) as unknown as typeof fetch;

// The renderer now mounts under Clerk (ADR-0006): App wraps everything in `ClerkProvider` and bails to a
// config error unless the publishable key is present, and `AuthProvider` reads Clerk's `useAuth`. jsdom
// cannot run real Clerk, so we mock the whole `@clerk/electron/react` surface with a controllable state
// holder (see src/test/clerk.ts). A non-secret placeholder key satisfies App's configuration guard.
vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_mock');

const clerk = vi.hoisted(() => {
  const noError = async () => ({ error: null });
  return {
    state: { isLoaded: true, isSignedIn: false, userId: null as string | null },
    getToken: async () => (clerk.state.isSignedIn ? 'test-jwt' : null),
    signOut: async () => {
      clerk.state.isSignedIn = false;
      clerk.state.userId = null;
    },
    signIn: {
      status: 'needs_identifier',
      createdSessionId: null,
      sso: noError,
      create: noError,
      password: noError,
      finalize: noError,
      reset: noError,
      emailCode: { sendCode: noError, verifyCode: noError },
      resetPasswordEmailCode: { sendCode: noError, verifyCode: noError, submitPassword: noError },
    },
    signUp: {
      status: 'missing_requirements',
      createdSessionId: null,
      unverifiedFields: [] as string[],
      sso: noError,
      create: noError,
      password: noError,
      finalize: noError,
      reset: noError,
      verifications: { sendEmailCode: noError, verifyEmailCode: noError },
    },
  };
});

vi.mock('@clerk/electron/react', () => ({
  ClerkProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({
    isLoaded: clerk.state.isLoaded,
    isSignedIn: clerk.state.isSignedIn,
    userId: clerk.state.userId,
    getToken: clerk.getToken,
    signOut: clerk.signOut,
  }),
  SignIn: () =>
    createElement(
      'div',
      null,
      createElement('h1', null, 'Sign in to your account'),
      createElement('input', { 'aria-label': 'Email', type: 'email' }),
      createElement('input', { 'aria-label': 'Password', type: 'password' }),
      createElement('button', { type: 'button' }, 'Continue with Google'),
      createElement('a', { href: '#/sign-up' }, 'Sign up'),
    ),
  SignUp: () => createElement('div', null, createElement('h1', null, 'Create your account')),
  useSignIn: () => ({ signIn: clerk.signIn, errors: {}, fetchStatus: 'idle' }),
  useSignUp: () => ({ signUp: clerk.signUp, errors: {}, fetchStatus: 'idle' }),
}));

// Register the holder on globalThis so the typed test helper (src/test/clerk.ts) can drive the state.
(globalThis as unknown as { __clerkMock: typeof clerk }).__clerkMock = clerk;

// Default every test to a signed-out Clerk session unless it opts in.
beforeEach(() => {
  clerk.state.isLoaded = true;
  clerk.state.isSignedIn = false;
  clerk.state.userId = null;
});

// Vitest does not enable RTL auto-cleanup without globals; unmount between tests explicitly.
afterEach(() => cleanup());
