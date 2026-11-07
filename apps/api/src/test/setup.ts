/**
 * Vitest global setup. Runs before every test file (see vitest.config.ts `setupFiles`).
 *
 * Integration tests are destructive: resetDb() deletes all application rows. Require an
 * explicit local TEST_DATABASE_URL with an unmistakable test database name; never inherit the
 * app's development DATABASE_URL as a fallback.
 */
import { parseIsolatedTestDatabaseUrl } from './database-safety.js';

if (process.env.NODE_ENV && process.env.NODE_ENV !== 'test') {
  throw new Error('NODE_ENV must be test before starting API integration tests');
}
process.env.NODE_ENV = 'test';
const testDatabase = parseIsolatedTestDatabaseUrl(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL = testDatabase.url.toString();
process.env.SESSION_SECRET ??= 'test-only-insecure-secret';
// Raise the brute-force ceilings so integration suites run many auth attempts without 429s;
// the throttle behaviour is covered by a dedicated security test with its own low limit.
process.env.AUTH_RATE_LIMIT ??= '100000';
process.env.INVITE_RATE_LIMIT ??= '100000';
process.env.CHAT_RATE_LIMIT ??= '100000';
process.env.INTELLIGENCE_RATE_LIMIT ??= '100000';
// Non-secret placeholders so the chat module's fail-closed guards (which only check PRESENCE of the
// App Key/Secret) let the mocked-provider tests exercise token minting and callback verification.
// These are NOT real credentials — no provider call is ever made (a fake provider is injected).
process.env.NEXCONN_APP_KEY ??= 'test-app-key';
process.env.NEXCONN_APP_SECRET ??= 'test-app-secret';

// Clerk (ADR-0006): tests never fabricate a real Clerk JWT nor hit live Clerk. Inject the fake
// verifier + profile seams (see test/clerk-fixtures.ts) so the API's verification boundary, identity
// mapping and provisioning run end-to-end without live credentials. Imported dynamically AFTER the
// env defaults above, because `lib/env.ts` (reached via the Clerk module) loads eagerly at import.
const { installFakeClerkSeams } = await import('./clerk-fixtures.js');
installFakeClerkSeams();

// Empty export so this file is an ES module (top-level `await` above requires module scope).
export {};
