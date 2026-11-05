/**
 * Vitest global setup. Runs before every test file (see vitest.config.ts `setupFiles`).
 *
 * `lib/env.ts` loads and validates configuration eagerly at import time (DATABASE_URL is
 * required because auth/workspaces are backed by PostgreSQL). These are non-secret dev/test
 * defaults pointing at the local Docker PostgreSQL (docs/environment-setup.md); a real
 * integration test migrates and exercises this schema. Override via the environment when the
 * test database differs.
 */
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??=
  'postgresql://buildtogether:buildtogether@127.0.0.1:5432/buildtogether';
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
