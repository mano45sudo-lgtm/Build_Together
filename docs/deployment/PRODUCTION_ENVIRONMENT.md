# Production Environment Variable Inventory

Authoritative inventory, reconciled with source in Batch 0D-A (2026-11-08): `apps/api/src/lib/env.ts`,
`runtime-environment.ts`, `config-validation.ts`, `clerk-env.ts`, `database-config.ts`,
`apps/api/prisma.config.ts`, and the Electron/Vite build configuration. Set values through each
environment's secret/configuration manager. Never copy production values into the repository or
this document.

## Environments

`NODE_ENV` accepts exactly `development` (default when unset), `test` (Vitest harnesses) or
`production` — lowercase, no surrounding whitespace. Anything else (`staging`, `Production`, …) is
rejected at startup by both the API and the Prisma CLI, instead of silently falling back to
development defaults. A staging deployment is a separate environment that runs with
`NODE_ENV=production` and its own isolated values (database, Clerk instance, Nexconn app); there is
no staging-specific behaviour. The Docker image sets `NODE_ENV=production` by default.

## API service

| Variable                         | Purpose / consumer                                             | Development                      | Production                                                                                              | Secret?           |
| -------------------------------- | -------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------- |
| `NODE_ENV`                       | Runtime mode; every production guard keys off it               | `development` (default)          | `production` (image default); unsupported values refused                                                | No                |
| `PORT`                           | HTTP listen port                                               | Default 4000                     | Platform-provided (Railway injects it)                                                                  | No                |
| `CORS_ORIGIN`                    | Single **browser** origin allowed to read responses (`app.ts`) | Defaults `http://localhost:5173` | **Optional.** Unset → no CORS headers. If set: exactly `app://bundle` or an exact public `https` origin | No                |
| `TRUST_PROXY_HOPS`               | Express client IP for rate limiting                            | Defaults 0                       | Required; exact hop count (0–10) of the verified proxy chain                                            | No                |
| `DATABASE_URL`                   | Runtime `pg` pool and Prisma CLI                               | Local DB                         | Required private PostgreSQL URL                                                                         | Secret            |
| `DATABASE_POOL_MAX`              | Per-process pool cap                                           | Default 5                        | Optional 1–20; budget across replicas                                                                   | No                |
| `DATABASE_CONNECTION_TIMEOUT_MS` | Pool connect timeout                                           | Default 5000                     | Optional 100–30000                                                                                      | No                |
| `DATABASE_IDLE_TIMEOUT_MS`       | Pool idle timeout                                              | Default 10000                    | Optional 1000–300000                                                                                    | No                |
| `DATABASE_SSL_MODE`              | Database TLS (runtime and migrations)                          | Defaults `disable`               | Required `verify-full`                                                                                  | No                |
| `DATABASE_SSL_ROOT_CERT`         | Absolute path to the trusted CA file                           | Optional                         | Required for a private-CA database (Railway); delivery design in `DATABASE_DEPLOYMENT.md`               | No                |
| `INVITATION_TTL_SECONDS`         | Invitation expiry                                              | Default 604800                   | Optional                                                                                                | No                |
| `AUTH_RATE_LIMIT`                | Invitation-accept limiter                                      | Default 10 / 15m                 | Optional; per process                                                                                   | No                |
| `INVITE_RATE_LIMIT`              | Invitation-create limiter                                      | Default 30 / 15m                 | Optional; per process                                                                                   | No                |
| `CHAT_RATE_LIMIT`                | Chat management/token limiter                                  | Default 60 / 5m                  | Optional; per process                                                                                   | No                |
| `INTELLIGENCE_RATE_LIMIT`        | Intelligence API limiter                                       | Default 120 / 5m                 | Optional; per process                                                                                   | No                |
| `PUBLIC_APP_BASE_URL`            | Base of the **development** invitation link                    | Defaults `http://localhost:5173` | **Ignored.** Production shares the bare invite code (no URL is built)                                   | No                |
| `CLERK_SECRET_KEY`               | Clerk Backend SDK: verification and first-login profile        | Optional (`sk_test_` allowed)    | Required; a production-instance key — `sk_test_` is refused                                             | Secret            |
| `CLERK_JWT_KEY`                  | Local Clerk JWT signature verification                         | Optional                         | Optional public PEM (the secret key is still required for provisioning)                                 | No (public key)   |
| `CLERK_JWT_ISSUER`               | Clerk JWT issuer validation                                    | Optional                         | Required; the production instance's issuer                                                              | No                |
| `CLERK_AUTHORIZED_PARTIES`       | Clerk `azp` allowlist (comma-separated)                        | Optional                         | Required; includes `app://bundle` for the packaged desktop                                              | No                |
| `CLERK_JWT_AUDIENCE`             | Expected JWT audience                                          | Optional                         | Only if the production token configuration emits one                                                    | No                |
| `NEXCONN_APP_KEY`                | Nexconn app/client identifier                                  | All four or none                 | All four or none (none = chat disabled, 503 `CHAT_UNAVAILABLE`)                                         | Public identifier |
| `NEXCONN_APP_SECRET`             | Server SDK signing, tokens and callback verification           | All four or none                 | All four or none                                                                                        | Secret            |
| `NEXCONN_PRIMARY_API_DOMAIN`     | SDK primary base URL (`setPrimaryBackupDomains`)               | Absolute `http(s)` URL           | Absolute `https` URL; no credentials, query or fragment                                                 | No                |
| `NEXCONN_SECONDARY_API_DOMAIN`   | SDK failover base URL                                          | Absolute `http(s)` URL           | Absolute `https` URL; no credentials, query or fragment                                                 | No                |
| `NEXCONN_TOKEN_TTL_SECONDS`      | Advertised client-token expiry                                 | Default 3600                     | Confirm the provider-issued lifetime matches                                                            | No                |
| `NEXCONN_WEBHOOK_MAX_SKEW_MS`    | Callback timestamp replay window                               | Default 300000                   | Review against provider delivery clocks                                                                 | No                |

Removed in Batch 0D-A (no longer read; do not configure): `SESSION_SECRET`,
`ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS` — remnants of the pre-Clerk session system
(ADR-0006). Not implemented, so not read: `SMTP_URL`, `AI_PROVIDER`, `AI_API_KEY`.
`TEST_DATABASE_URL` is integration-test-only and must never be configured in a deployment.

### CORS semantics

`CORS_ORIGIN` is the caller's browser origin, never the API's hostname. The Electron main process
makes every authenticated API call server-side without an `Origin` header, so CORS never applies to
it. The only browser caller is the renderer's API status check
(`apps/desktop/src/lib/apiClient.ts`), whose packaged origin is `app://bundle`; set
`CORS_ORIGIN=app://bundle` if that indicator should read the production health endpoint. Leaving
it unset sends no CORS headers (all cross-origin browser reads blocked). Credentials are never
allowed, and only one exact origin is ever reflected.

### Invitations

No transactional email provider exists, so the inviter shares the invitation themselves. In
development the API returns a link built from `PUBLIC_APP_BASE_URL`; in production it returns the
bare invite code, because no page or deep link serves `/invite/accept`. The desktop "Have an
invitation?" field accepts either, and acceptance still requires the signed-in user's email to match
the invitation.

## Electron desktop build

| Variable                       | Consumer                                                                                                          | Development                          | Production build                                                 | Secret? |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------- | ------- |
| `BT_API_BASE_URL`              | `electron.vite.config.ts` embeds the endpoint into Electron main; main passes it only through typed `getConfig()` | Defaults localhost:4000              | Required public HTTPS API origin; build fails if absent/invalid  | No      |
| `VITE_API_BASE_URL`            | Browser-only renderer fallback                                                                                    | Optional localhost for tests/browser | Not used by Electron runtime                                     | No      |
| `VITE_CLERK_PUBLISHABLE_KEY`   | Clerk renderer SDK                                                                                                | Any key, or none                     | Required; a production-instance key — `pk_test_` fails the build | Public  |
| `VITE_CLERK_FRONTEND_API_HOST` | Electron CSP and Clerk Frontend API                                                                               | Can derive from publishable key      | Required explicit exact host                                     | Public  |
| `ELECTRON_RENDERER_URL`        | electron-vite development origin and IPC/CSP checks                                                               | Tool-injected                        | Not set in packaged runtime                                      | No      |
| `BT_PROD`                      | Local smoke mode switch for unpackaged Electron                                                                   | Test-only                            | Not a deployment setting                                         | No      |
| `BT_SMOKE`                     | Startup smoke check                                                                                               | Test-only                            | Not a deployment setting                                         | No      |

`CLERK_SECRET_KEY`, `NEXCONN_APP_SECRET` and `DATABASE_URL` belong only to the API service. Never
use `VITE_` for a secret: every `VITE_` value is embedded in the renderer bundle. Production desktop
builds read only `.env.production` or process environment (`.env`/`.env.local` holding these values
fail the build); the installed app does not load `.env` files.

Not cross-validated (deliberately): that the publishable key, `VITE_CLERK_FRONTEND_API_HOST` and the
API's `CLERK_JWT_ISSUER` belong to the same Clerk instance. Clerk does not document the
publishable-key encoding as a contract, and the desktop build and the API are configured separately.
Verify the three together during release configuration.

## Environment separation and owner actions

Development uses Clerk development credentials and a separate Nexconn development app where
available. Every deployed environment runs `NODE_ENV=production` with its own isolated Clerk
instance, Nexconn app and database. The project owner provides the HTTPS API origin, production
Clerk issuer, authorized parties, publishable key and frontend hostname, the database CA, and the
Nexconn base URLs through their secure dashboards. No production value was read or set here.
