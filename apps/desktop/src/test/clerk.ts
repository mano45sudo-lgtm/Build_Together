/**
 * Test helper for the mocked Clerk surface installed in setup.ts. It drives the shared `useAuth` state
 * holder so a test can render the renderer either signed-out (the sign-in gate) or signed-in (the
 * authenticated shell). Keep in sync with the `vi.hoisted` holder in `./setup.ts`.
 */

type ClerkMockHolder = {
  state: { isLoaded: boolean; isSignedIn: boolean; userId: string | null; issuesToken: boolean };
};

function holder(): ClerkMockHolder {
  const h = (globalThis as unknown as { __clerkMock?: ClerkMockHolder }).__clerkMock;
  if (!h) throw new Error('Clerk test mock is not installed — import setup via vitest setupFiles.');
  return h;
}

/** Mark Clerk as signed-in (so AuthProvider syncs a token and pulls `me`) with the given user id. */
export function signInAsClerk(userId = 'u_1'): void {
  const h = holder();
  h.state.isLoaded = true;
  h.state.isSignedIn = true;
  h.state.userId = userId;
}

/** Mark Clerk as signed-out (the default between tests). */
export function signOutFromClerk(): void {
  const h = holder();
  h.state.isSignedIn = false;
  h.state.userId = null;
}

/** Simulate Clerk reporting signed-in while `getToken()` keeps returning null. */
export function setClerkIssuesToken(issues: boolean): void {
  holder().state.issuesToken = issues;
}

/** Hold Clerk in its boot state to verify the app still mounts the auth screen. */
export function setClerkLoaded(loaded: boolean): void {
  holder().state.isLoaded = loaded;
}

type MockFn = import('vitest').Mock<(...args: never[]) => Promise<unknown>>;

/** Loosely typed handle on the Clerk resource stand-ins installed by setup.ts (reset per test). */
export interface ClerkResourceMocks {
  signIn: {
    status: string;
    supportedFirstFactors: { strategy: string }[];
    supportedSecondFactors: { strategy: string }[];
    create: MockFn;
    password: MockFn;
    finalize: MockFn;
    reset: MockFn;
    emailCode: { sendCode: MockFn; verifyCode: MockFn };
    resetPasswordEmailCode: { sendCode: MockFn; verifyCode: MockFn; submitPassword: MockFn };
    mfa: Record<
      'sendEmailCode' | 'verifyEmailCode' | 'sendPhoneCode' | 'verifyPhoneCode' | 'verifyTOTP',
      MockFn
    >;
  };
  signUp: {
    status: string;
    missingFields: string[];
    unverifiedFields: string[];
    create: MockFn;
    update: MockFn;
    password: MockFn;
    finalize: MockFn;
    reset: MockFn;
    verifications: { sendEmailCode: MockFn; verifyEmailCode: MockFn };
  };
  clerk: {
    loaded: boolean;
    session: unknown;
    signOut: import('vitest').Mock<() => Promise<void>>;
    setActive: import('vitest').Mock<(params: unknown) => Promise<void>>;
    client: {
      signIn: {
        authenticateWithRedirect: import('vitest').Mock<(params: unknown) => Promise<void>>;
      };
      signUp: { status: string | null };
    };
  };
}

export function clerkResources(): ClerkResourceMocks {
  return holder() as unknown as ClerkResourceMocks;
}

/** A Clerk API error as the future API returns it in `{ error }`. */
export function clerkApiError(code: string, longMessage = 'Clerk error'): unknown {
  return { errors: [{ code, message: longMessage, longMessage }] };
}
