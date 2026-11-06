import { unauthorized } from '../errors/app-error.js';
import {
  setClerkSeams,
  type ClerkProfileFetcher,
  type ClerkSessionVerifier,
} from '../lib/clerk.js';

/**
 * Clerk test fixtures (mirrors the chat module's fake-provider seam). Tests never fabricate a real
 * Clerk JWT; instead they mint an opaque "session token" that these injected seams resolve to a
 * stable Clerk identity, so the API's verification boundary, mapping, provisioning and
 * authorization logic run end-to-end without live Clerk credentials.
 *
 * `mintClerkToken` registers a Clerk identity (its `sub`, verified email and name) and returns a
 * bearer token. The verifier accepts ONLY registered tokens (an unregistered/garbage token fails
 * closed with 401, exactly like production), and the profile fetcher supplies the verified email +
 * name used solely for first-login provisioning.
 */

interface Fixture {
  clerkUserId: string;
  email: string;
  name: string;
}

const byToken = new Map<string, Fixture>();
const byId = new Map<string, Fixture>();
let counter = 0;

/** Register a Clerk identity and return the bearer token the fake verifier will accept for it. */
export function mintClerkToken(input: {
  clerkUserId: string;
  email: string;
  name: string;
}): string {
  const fixture: Fixture = { clerkUserId: input.clerkUserId, email: input.email, name: input.name };
  const token = `clerk_sess_${++counter}_${fixture.clerkUserId}`;
  byToken.set(token, fixture);
  byId.set(fixture.clerkUserId, fixture);
  return token;
}

/** Install the fake verifier + profile fetcher into the Clerk seam (called once from test setup). */
export function installFakeClerkSeams(): void {
  const verifier: ClerkSessionVerifier = async (token) => {
    const fixture = byToken.get(token);
    if (!fixture) throw unauthorized('INVALID_SESSION', 'Session is invalid or expired');
    return { clerkUserId: fixture.clerkUserId, sessionId: `sid_${fixture.clerkUserId}` };
  };
  const profileFetcher: ClerkProfileFetcher = async (clerkUserId) => {
    const fixture = byId.get(clerkUserId);
    if (!fixture) throw unauthorized('UNKNOWN_IDENTITY', 'Clerk identity could not be resolved');
    return { email: fixture.email, name: fixture.name };
  };
  setClerkSeams({ verifier, profileFetcher });
}

/** Clear registered identities (the DB is reset separately by the harness). */
export function resetClerkFixtures(): void {
  byToken.clear();
  byId.clear();
  counter = 0;
}
