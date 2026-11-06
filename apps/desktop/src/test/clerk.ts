/**
 * Test helper for the mocked Clerk surface installed in setup.ts. It drives the shared `useAuth` state
 * holder so a test can render the renderer either signed-out (the sign-in gate) or signed-in (the
 * authenticated shell). Keep in sync with the `vi.hoisted` holder in `./setup.ts`.
 */

type ClerkMockHolder = {
  state: { isLoaded: boolean; isSignedIn: boolean; userId: string | null };
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
