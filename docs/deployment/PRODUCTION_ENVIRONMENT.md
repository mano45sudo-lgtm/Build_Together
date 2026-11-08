# Production Environment Variable Inventory

This is the authoritative Phase 4 inventory based on source reads in `apps/api/src/lib/env.ts`,
`apps/api/src/lib/database-config.ts`, Electron/Vite configuration and the runtime consumers. Set
values through each environment's secret/configuration manager. Do not copy production values into
the repository or this document.

## API service

| Variable                         | Purpose / consumer                                           | Development                        | Production                                                              | Secret?           |
| -------------------------------- | ------------------------------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------- | ----------------- |
| `NODE_ENV`                       | API runtime mode; `apps/api`                                 | `development`                      | Required: `production`                                                  | No                |
| `PORT`                           | HTTP listen port                                             | Default 4000                       | Platform-provided port                                                  | No                |
| `CORS_ORIGIN`                    | Exact single browser origin allowed by `apps/api/src/app.ts` | Defaults localhost:5173            | Required public HTTPS origin; no wildcard                               | No                |
| `TRUST_PROXY_HOPS`               | Express client IP / rate-limit proxy trust                   | Defaults 0                         | Required exact topology hop count (0–10)                                | No                |
| `DATABASE_URL`                   | Prisma 7 `PrismaPg` runtime and Prisma CLI                   | Local DB                           | Required private PostgreSQL URL                                         | Secret            |
| `DATABASE_POOL_MAX`              | Per-process pg pool cap                                      | Default 5                          | Optional 1–20; budget across replicas                                   | No                |
| `DATABASE_CONNECTION_TIMEOUT_MS` | Pool connect timeout                                         | Default 5000                       | Optional 100–30000                                                      | No                |
| `DATABASE_IDLE_TIMEOUT_MS`       | Pool idle timeout                                            | Default 10000                      | Optional 1000–300000                                                    | No                |
| `DATABASE_SSL_MODE`              | Database TLS verification                                    | Defaults `disable`                 | Required `verify-full`                                                  | No                |
| `DATABASE_SSL_ROOT_CERT`         | Absolute CA certificate file path when needed                | Optional                           | Optional; mount/manage CA file                                          | No                |
| `SESSION_SECRET`                 | Legacy session/token code configuration                      | Dev-only fallback                  | Required strong random value by current boot guard                      | Secret            |
| `ACCESS_TOKEN_TTL_SECONDS`       | Legacy token code setting                                    | Default 900                        | Optional; source currently retained                                     | No                |
| `REFRESH_TOKEN_TTL_SECONDS`      | Legacy token code setting                                    | Default 2592000                    | Optional; source currently retained                                     | No                |
| `INVITATION_TTL_SECONDS`         | Invitation expiry                                            | Default 604800                     | Optional                                                                | No                |
| `AUTH_RATE_LIMIT`                | Auth endpoint in-memory limiter                              | Default 10 / 15m                   | Optional; per process                                                   | No                |
| `INVITE_RATE_LIMIT`              | Invitation limiter                                           | Default 30 / 15m                   | Optional; per process                                                   | No                |
| `CHAT_RATE_LIMIT`                | Chat management/token limiter                                | Default 60 / 5m                    | Optional; per process                                                   | No                |
| `INTELLIGENCE_RATE_LIMIT`        | Intelligence API limiter                                     | Default 120 / 5m                   | Optional; per process                                                   | No                |
| `PUBLIC_APP_BASE_URL`            | Invitation link generation                                   | Defaults localhost:5173            | Set to actual HTTPS app URL if invitation delivery is enabled           | No                |
| `CLERK_SECRET_KEY`               | Clerk Backend SDK profile fetch and remote verifier          | Optional test/development          | Required live secret key                                                | Secret            |
| `CLERK_JWT_KEY`                  | Local Clerk JWT signature verification                       | Optional                           | Optional public PEM; still requires secret for first-login provisioning | No (public key)   |
| `CLERK_JWT_ISSUER`               | Clerk JWT issuer validation                                  | Optional                           | Required; exact production issuer                                       | No                |
| `CLERK_AUTHORIZED_PARTIES`       | Clerk `azp` allowlist (comma-separated)                      | Optional                           | Required; exact app origins                                             | No                |
| `CLERK_JWT_AUDIENCE`             | Optional expected JWT audience                               | Optional                           | Required only if production token template/config emits an audience     | No                |
| `NEXCONN_APP_KEY`                | Nexconn app/client identifier                                | Optional as a complete unset group | Optional if chat is disabled; otherwise required with the other three   | Public identifier |
| `NEXCONN_APP_SECRET`             | Server SDK signing, tokens and callback verification         | Optional as a complete unset group | Optional if chat is disabled; otherwise required with the other three   | Secret            |
| `NEXCONN_PRIMARY_API_DOMAIN`     | Server SDK regional endpoint                                 | Optional as a complete unset group | Optional if chat is disabled; otherwise account/data-center supplied    | No                |
| `NEXCONN_SECONDARY_API_DOMAIN`   | Server SDK failover endpoint                                 | Optional as a complete unset group | Optional if chat is disabled; otherwise account/data-center supplied    | No                |
| `NEXCONN_TOKEN_TTL_SECONDS`      | Advertised client-token expiry                               | Default 3600                       | Confirm provider-issued lifetime matches                                | No                |
| `NEXCONN_WEBHOOK_MAX_SKEW_MS`    | Callback timestamp replay window                             | Default 300000                     | Review against provider delivery clocks                                 | No                |

`TEST_DATABASE_URL` is integration-test-only and must never be configured in deployments. `SMTP_URL`,
`AI_PROVIDER`, and `AI_API_KEY` appear in the example template but have no active production
consumer in the current source; do not configure them for this release.

## Electron desktop build

| Variable                       | Consumer                                                                                                          | Development                          | Production build                                                   | Secret? |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------ | ------- |
| `BT_API_BASE_URL`              | `electron.vite.config.ts` embeds the endpoint into Electron main; main passes it only through typed `getConfig()` | Defaults localhost:4000              | Required public HTTPS API origin; build fails if absent/invalid    | No      |
| `VITE_API_BASE_URL`            | Browser-only renderer fallback                                                                                    | Optional localhost for tests/browser | Not used by Electron runtime; set only for an actual browser build | No      |
| `VITE_CLERK_PUBLISHABLE_KEY`   | Clerk renderer SDK                                                                                                | Clerk development key                | Clerk production publishable key                                   | Public  |
| `VITE_CLERK_FRONTEND_API_HOST` | Electron CSP and Clerk frontend API                                                                               | Can derive from publishable key      | Required explicit exact host                                       | Public  |
| `ELECTRON_RENDERER_URL`        | electron-vite development origin and IPC/CSP checks                                                               | Tool-injected                        | Not set in packaged runtime                                        | No      |
| `BT_PROD`                      | Local smoke mode switch for unpackaged Electron                                                                   | Test-only                            | Not a deployment setting                                           | No      |
| `BT_SMOKE`                     | Startup smoke check                                                                                               | Test-only                            | Not a deployment setting                                           | No      |

`CLERK_SECRET_KEY`, `NEXCONN_APP_SECRET`, and `DATABASE_URL` belong only to the API service. Never
use `VITE_` for a secret. `apps/desktop/electron-builder.yml` excludes `.env*`; `.env` is not a
runtime configuration mechanism for installed Cue.

## Environment separation and owner actions

Development uses Clerk test credentials and a separate Nexconn development app where available.
Staging and production must each use isolated Clerk instances/keys, Nexconn app credentials and
database URLs. The project owner must provide the actual HTTPS API origin, production Clerk issuer,
authorized parties, publishable key and frontend hostname, plus Nexconn region-specific endpoints
and callback settings through their secure dashboards. No production value was read or set here.
