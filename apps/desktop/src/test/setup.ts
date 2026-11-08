import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

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
  const ok = () => vi.fn(async () => ({ error: null as unknown }));

  // Fresh, controllable stand-ins for Clerk's future-API resources. Tests reshape them through the
  // holder (src/test/clerk.ts) — e.g. `clerk.signIn.create.mockResolvedValue({ error })`.
  function createSignIn() {
    return {
      status: 'needs_identifier' as string,
      supportedFirstFactors: [] as { strategy: string }[],
      supportedSecondFactors: [] as { strategy: string }[],
      create: ok(),
      password: ok(),
      finalize: ok(),
      reset: ok(),
      emailCode: { sendCode: ok(), verifyCode: ok() },
      resetPasswordEmailCode: { sendCode: ok(), verifyCode: ok(), submitPassword: ok() },
      mfa: {
        sendEmailCode: ok(),
        verifyEmailCode: ok(),
        sendPhoneCode: ok(),
        verifyPhoneCode: ok(),
        verifyTOTP: ok(),
      },
    };
  }

  function createSignUp() {
    return {
      status: 'missing_requirements' as string,
      missingFields: [] as string[],
      unverifiedFields: [] as string[],
      create: ok(),
      update: ok(),
      password: ok(),
      finalize: ok(),
      reset: ok(),
      verifications: { sendEmailCode: ok(), verifyEmailCode: ok() },
    };
  }

  function createClient() {
    return {
      loaded: true,
      session: null as unknown,
      signOut: vi.fn(async () => undefined),
      setActive: vi.fn(async (_params: unknown) => undefined),
      client: {
        signIn: { authenticateWithRedirect: vi.fn(async (_params: unknown) => undefined) },
        signUp: { status: null as string | null },
      },
    };
  }

  return {
    state: {
      isLoaded: true,
      isSignedIn: false,
      userId: null as string | null,
      // False simulates Clerk reporting signed-in without issuing a session JWT.
      issuesToken: true,
    },
    getToken: async () =>
      clerk.state.isSignedIn && clerk.state.issuesToken ? `test-jwt-${clerk.state.userId}` : null,
    signOut: async () => {
      clerk.state.isSignedIn = false;
      clerk.state.userId = null;
    },
    signIn: createSignIn(),
    signUp: createSignUp(),
    clerk: createClient(),
    reset() {
      clerk.signIn = createSignIn();
      clerk.signUp = createSignUp();
      clerk.clerk = createClient();
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
  useSignIn: () => ({ signIn: clerk.signIn, errors: {}, fetchStatus: 'idle' }),
  useSignUp: () => ({ signUp: clerk.signUp, errors: {}, fetchStatus: 'idle' }),
  useClerk: () => clerk.clerk,
}));

// Register the holder on globalThis so the typed test helper (src/test/clerk.ts) can drive the state.
(globalThis as unknown as { __clerkMock: typeof clerk }).__clerkMock = clerk;

// Default every test to a signed-out Clerk session unless it opts in.
beforeEach(() => {
  clerk.state.isLoaded = true;
  clerk.state.isSignedIn = false;
  clerk.state.userId = null;
  clerk.state.issuesToken = true;
  clerk.reset();
});

// Vitest does not enable RTL auto-cleanup without globals; unmount between tests explicitly.
afterEach(() => cleanup());
