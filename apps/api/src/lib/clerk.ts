import { createClerkClient, verifyToken } from '@clerk/backend';
import { serviceUnavailable, unauthorized } from '../errors/app-error.js';
import { env } from './env.js';
import { buildVerifiedClerkProfile } from './clerk-profile.js';

/**
 * Clerk session verification + profile resolution (ADR-0006). Authentication is delegated to
 * Clerk; this module is the API's single trust boundary for identity. It performs the two things
 * the rest of the server is allowed to rely on:
 *
 *  1. `verifyClerkSessionToken` cryptographically verifies a Clerk session token (signature,
 *     issuer, audience, authorized parties, expiry) with Clerk's supported Backend SDK and returns
 *     ONLY the stable Clerk user id (`sub`) and session id (`sid`). We never decode a JWT by hand
 *     and never trust an unverified token.
 *  2. `fetchClerkUserProfile` reads a Clerk user's verified email + name from the Clerk Backend API,
 *     used solely to provision an internal user on FIRST login. It is not called on every request.
 *
 * Both are resolved lazily from server-side env (config lives only in `lib/env.ts`). They fail
 * closed when Clerk is unconfigured so the API still boots for non-auth work. `setClerkSeams` is
 * the test seam — the same pattern as the chat provider — so unit/integration tests verify the
 * mapping, provisioning and authorization logic WITHOUT live Clerk credentials and WITHOUT
 * fabricating a Clerk JWT.
 */

/** The verified facts a bearer Clerk session token yields (identifiers only — never the token). */
export interface VerifiedClerkSession {
  clerkUserId: string;
  sessionId: string;
}

/** The identity attributes Clerk holds for provisioning an internal user (never password-based). */
export interface ClerkUserProfile {
  email: string;
  name?: string | undefined;
  verifiedEmails?: string[] | undefined;
}

export type ClerkSessionVerifier = (token: string) => Promise<VerifiedClerkSession>;
export type ClerkProfileFetcher = (clerkUserId: string) => Promise<ClerkUserProfile>;

let verifier: ClerkSessionVerifier | null = null;
let profileFetcher: ClerkProfileFetcher | null = null;

/** Networkless JWKS/PEM path is created once; the Secret Key never leaves the server. */
let client: ReturnType<typeof createClerkClient> | null = null;
function getClerkClient(): ReturnType<typeof createClerkClient> | null {
  if (!env.clerkSecretKey) return null;
  client ??= createClerkClient({
    secretKey: env.clerkSecretKey,
    ...(env.clerkJwtKey ? { jwtKey: env.clerkJwtKey } : {}),
  });
  return client;
}

export async function verifyClerkSessionToken(token: string): Promise<VerifiedClerkSession> {
  if (!env.clerkJwtKey && !env.clerkSecretKey) {
    // Unconfigured → cannot verify anyone. Fail closed as unauthenticated (never a bypass).
    throw unauthorized('AUTH_NOT_CONFIGURED', 'Authentication is not configured');
  }
  let payload: Awaited<ReturnType<typeof verifyToken>>;
  try {
    payload = await verifyToken(token, {
      secretKey: env.clerkSecretKey,
      jwtKey: env.clerkJwtKey,
      issuer: env.clerkIssuer,
      audience: env.clerkAudience,
      authorizedParties: env.clerkAuthorizedParties,
    });
  } catch {
    // Any verification failure (bad signature, expired, wrong issuer/audience/ap) is one vague 401.
    throw unauthorized('INVALID_SESSION', 'Session is invalid or expired');
  }
  const clerkUserId = payload.sub;
  if (!clerkUserId) throw unauthorized('INVALID_SESSION', 'Session is invalid or expired');
  return { clerkUserId, sessionId: payload.sid ?? clerkUserId };
}

export async function fetchClerkUserProfile(clerkUserId: string): Promise<ClerkUserProfile> {
  const clerk = getClerkClient();
  if (!clerk) {
    throw unauthorized('AUTH_NOT_CONFIGURED', 'Authentication is not configured');
  }
  let user: Awaited<ReturnType<typeof clerk.users.getUser>>;
  try {
    user = await clerk.users.getUser(clerkUserId);
  } catch {
    throw serviceUnavailable(
      'CLERK_PROFILE_UNAVAILABLE',
      'Clerk profile is temporarily unavailable',
    );
  }
  const profile = buildVerifiedClerkProfile(user);
  if (!profile) {
    throw unauthorized('NO_VERIFIED_EMAIL', 'A verified email address is required to use Cue');
  }
  return profile;
}

/** Resolve the verifier (real from env, or the injected test seam). */
export function getClerkVerifier(): ClerkSessionVerifier {
  return verifier ?? verifyClerkSessionToken;
}

/** Resolve the profile fetcher (real from env, or the injected test seam). */
export function getClerkProfileFetcher(): ClerkProfileFetcher {
  return profileFetcher ?? fetchClerkUserProfile;
}

/**
 * Test seam: override (or with `null`, reset) both Clerk resolvers. Never used in production code.
 * Tests inject a fake so the mapping/provisioning/authorization logic runs without live
 * credentials and without minting a real Clerk JWT.
 */
export function setClerkSeams(seams: {
  verifier?: ClerkSessionVerifier | null;
  profileFetcher?: ClerkProfileFetcher | null;
}): void {
  if ('verifier' in seams) verifier = seams.verifier ?? null;
  if ('profileFetcher' in seams) profileFetcher = seams.profileFetcher ?? null;
}
