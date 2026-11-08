# Cue Deployment — Phase 0 Readiness Audit

Date: 2026-11-08. Target: Railway + Cloudflare, later AWS ECS Fargate + RDS PostgreSQL.
Audit only: no source files changed, no installs, no migrations, no production or Railway
connections, no SQL executed, no secrets printed. The only database access was a read-only list of
local database names. Phase 1 has not started.

Classification: **PASS** · **NEEDS ATTENTION** · **BLOCKER** · **NOT VERIFIED**.

## 1. Executive readiness assessment

**Verdict: NOT READY to deploy yet, but close.** The API code is in good production shape:
separate liveness and readiness endpoints, drain-then-disconnect graceful shutdown, a bounded
database pool, fail-fast production config validation, a WASM Prisma engine (no platform-specific
engine binary) and a clean dependency audit. Typecheck, lint and all unit/component tests pass.

What is missing is the deployment layer around it. There are **4 blockers**:

1. There is no container build: no Dockerfile, `.dockerignore` or Railway config exists.
2. The production migration path does not fit a lean runtime image: the Prisma CLI is a
   devDependency, and `prisma.config.ts` imports a TypeScript source file.
3. Production requires `DATABASE_SSL_MODE=verify-full`; Railway's managed Postgres is unlikely to
   satisfy that as-is. This needs a decision, not a code weakening.
4. The production values do not exist yet: API domain, Clerk production instance, `CORS_ORIGIN`,
   and the desktop's build-time `BT_API_BASE_URL`.

## 2. Repository and runtime architecture

| Finding                                                                                                                                       | Status                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| pnpm workspace `apps/*`, `packages/*`; `packageManager: pnpm@11.8.0`; lockfile at root                                                        | **PASS**                                                                   |
| API `build` builds `@buildtogether/shared` first, then `tsc -p tsconfig.build.json` (NodeNext ESM) → `apps/api/dist`                          | **PASS** (compiled cleanly with `--noEmit`)                                |
| Shared package resolves at runtime via the workspace symlink to `packages/shared/dist` (ESM, `.js` specifiers)                                | **PASS**                                                                   |
| Start command: `node dist/index.js` (`start` script)                                                                                          | **PASS**                                                                   |
| Node version: root `engines: >=20` only; no `.nvmrc`; no pin in the API package. Local runtime is Node 24.13.1                                | **NEEDS ATTENTION**                                                        |
| `prisma.config.ts` imports `./src/lib/database-config.js` (TS source) and `dotenv/config`; the migrate CLI needs the source tree, not `dist/` | **NEEDS ATTENTION**                                                        |
| No `prisma migrate deploy` script; only `prisma migrate dev` (`prisma:migrate`), which must never run in production                           | **NEEDS ATTENTION**                                                        |
| Root `pnpm build` fails by design: the desktop production build needs `.env.production`                                                       | **NEEDS ATTENTION** (CI must use filtered builds)                          |
| Native module `@node-rs/argon2` loads at runtime (`lib/crypto.ts` → `password.ts`, used by invitations/sessions)                              | **NEEDS ATTENTION** (glibc Linux image; install deps inside the image)     |
| `@nexconn/server-sdk` installs from a pinned GitHub tarball with a `prepare` build                                                            | **NEEDS ATTENTION** (build needs outbound access to `codeload.github.com`) |
| Prisma generator is the legacy `prisma-client-js` (generated into `node_modules`)                                                             | **NEEDS ATTENTION** (affects image pruning)                                |

## 3. Docker deployment readiness

| Check                                | Status                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A Dockerfile exists                  | **BLOCKER**: none anywhere. `RAILWAY_CONFIGURATION.md` assumed Railway's Railpack auto-builder, but ECS Fargate needs an image anyway.                                                                                                                                                                             |
| Builds from monorepo root            | **NOT VERIFIED** (nothing to build). The build context must be the **repo root**: the lockfile, workspace manifest and shared package live there.                                                                                                                                                                  |
| Workspace dependencies handled       | **NOT VERIFIED**. Needs `pnpm install --frozen-lockfile --filter @buildtogether/api...` (the `...` includes the shared package) and the `allowBuilds` entries for prisma, the Nexconn SDK and esbuild.                                                                                                             |
| Shared package built before the API  | **PASS** in scripts; **NOT VERIFIED** in an image                                                                                                                                                                                                                                                                  |
| Prisma schema and migrations present | **NOT VERIFIED**. If Railway's pre-deploy step migrates from the same image, the runtime image needs `prisma/`, `prisma.config.ts`, `src/lib/database-config.ts`, the Prisma CLI and `dotenv`.                                                                                                                     |
| Runtime image has only runtime deps  | **BLOCKER** (design decision). A `--prod` install or `pnpm deploy` drops the devDependency Prisma CLI and the generated `prisma-client-js` client in `node_modules/.prisma`. Choose: keep both in the runtime image, or move to the `prisma-client` generator with an explicit output so `dist` is self-contained. |
| Non-root user                        | **NOT VERIFIED** (recommend `USER node`)                                                                                                                                                                                                                                                                           |
| Signal handling                      | **PASS** in code (SIGTERM/SIGINT → HTTP drain 8s → Prisma disconnect 5s). **NEEDS ATTENTION** in the container: use exec-form `CMD ["node","dist/index.js"]` so node is PID 1 and receives SIGTERM directly, not through `pnpm start`.                                                                             |
| Listen address                       | **PASS**: `app.listen(PORT)` binds all interfaces including IPv6, which Railway private networking needs                                                                                                                                                                                                           |

## 4. Database readiness

| Finding                                                                                                                       | Status                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` required at boot; validated as PostgreSQL; client-certificate params rejected; credentials never in error text | **PASS**                                                                                                                                                                                                                                                                                                  |
| Prisma 7: URL in `prisma.config.ts`; runtime `PrismaPg` with the same resolver; WASM query compiler (no native engine)        | **PASS**                                                                                                                                                                                                                                                                                                  |
| Pool: max 5 (bounded 1–20), connect timeout 5s, idle timeout 10s, all env-overridable                                         | **PASS**. Size as pool max × replicas + migration headroom against the database's connection limit.                                                                                                                                                                                                       |
| TLS: production requires `verify-full`, optional absolute CA path                                                             | **PASS** as policy. **BLOCKER** in practice for Railway Postgres: `verify-full` needs a trusted chain and a hostname match. Railway's managed Postgres is expected to present a self-signed certificate, and `*.railway.internal` is unlikely to match it. **NOT VERIFIED live.** Do not weaken silently. |
| 8 committed migrations, `migration_lock.toml` present, untouched                                                              | **PASS**                                                                                                                                                                                                                                                                                                  |
| Migration deploy path                                                                                                         | **NEEDS ATTENTION**: no `migrate deploy` script. Run once per release as Railway's pre-deploy command, never on every replica's start.                                                                                                                                                                    |
| Readiness probe: bounded `SELECT 1` (2.5s) → 503 `DATABASE_NOT_READY`                                                         | **PASS**                                                                                                                                                                                                                                                                                                  |
| Connectivity failures → 503 `DATABASE_UNAVAILABLE`                                                                            | **PASS**                                                                                                                                                                                                                                                                                                  |
| Quarantined destructive SQL lives in `docs/quarantine/sql`, outside the migrations path; nothing references it                | **PASS**. Also exclude `docs/` from the Docker build context.                                                                                                                                                                                                                                             |
| Backup and restore                                                                                                            | **NOT VERIFIED**: only a proposal in `DATABASE_MIGRATION_PLAN.md`; no schedule or restore drill.                                                                                                                                                                                                          |

## 5. Environment-variable inventory

"Railway" = set in the Railway service variables. No values are recorded here.

### API (runtime)

| Variable                                                                             | Purpose                                                | Production requirement                        | Env  | Secret                                   | Railway                                                                                                                                                           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------- | ---- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                           | Turns on all production validation                     | Required (`production`)                       | both | no                                       | Yes                                                                                                                                                               |
| `PORT`                                                                               | Listen port                                            | Injected                                      | both | no                                       | Railway sets it; do not override                                                                                                                                  |
| `DATABASE_URL`                                                                       | PostgreSQL connection                                  | Required                                      | both | **yes**                                  | Yes (reference the private database URL)                                                                                                                          |
| `DATABASE_SSL_MODE`                                                                  | `disable` or `verify-full`                             | Required (`verify-full`)                      | prod | no                                       | Yes                                                                                                                                                               |
| `DATABASE_SSL_ROOT_CERT`                                                             | Absolute path to a CA file                             | Optional                                      | prod | no (path)                                | Only if the CA is not in the trust store; the file must be in the image                                                                                           |
| `DATABASE_POOL_MAX`, `DATABASE_CONNECTION_TIMEOUT_MS`, `DATABASE_IDLE_TIMEOUT_MS`    | Pool tuning                                            | Optional (5 / 5000 / 10000)                   | both | no                                       | Optional                                                                                                                                                          |
| `CORS_ORIGIN`                                                                        | The one allowed browser origin                         | Required: exact public https origin           | both | no                                       | Yes. The desktop calls the API from Electron's main process, not a browser, so this must be a valid https origin even though nothing browser-based uses it today. |
| `TRUST_PROXY_HOPS`                                                                   | Proxy hops trusted for the client IP                   | Required (no default)                         | prod | no                                       | Yes; depends on topology (§7)                                                                                                                                     |
| `PUBLIC_APP_BASE_URL`                                                                | Base of invitation accept links                        | Optional; **defaults to localhost**, no check | prod | no                                       | Yes. **NEEDS ATTENTION**                                                                                                                                          |
| `SESSION_SECRET`                                                                     | Legacy (pre-Clerk); read by nothing at runtime         | **Required in prod** (startup check only)     | prod | yes                                      | Yes until removed. **NEEDS ATTENTION**                                                                                                                            |
| `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`                              | Legacy, unused                                         | Optional                                      | —    | no                                       | No                                                                                                                                                                |
| `INVITATION_TTL_SECONDS`                                                             | Invitation expiry                                      | Optional                                      | both | no                                       | Optional                                                                                                                                                          |
| `AUTH_RATE_LIMIT`, `INVITE_RATE_LIMIT`, `CHAT_RATE_LIMIT`, `INTELLIGENCE_RATE_LIMIT` | Request throttles                                      | Optional                                      | both | no                                       | Optional                                                                                                                                                          |
| `CLERK_SECRET_KEY`                                                                   | Clerk server key: token verification and profile reads | Required                                      | both | **yes**                                  | Yes (`sk_live`)                                                                                                                                                   |
| `CLERK_JWT_KEY`                                                                      | Clerk public key for offline token verification        | Optional, recommended                         | prod | no (public key)                          | Recommended                                                                                                                                                       |
| `CLERK_JWT_ISSUER`                                                                   | Expected token issuer                                  | Required                                      | prod | no                                       | Yes                                                                                                                                                               |
| `CLERK_AUTHORIZED_PARTIES`                                                           | Allowed token origins; must include `app://bundle`     | Required                                      | prod | no                                       | Yes                                                                                                                                                               |
| `CLERK_JWT_AUDIENCE`                                                                 | Expected token audience                                | Optional                                      | prod | no                                       | Only if configured in Clerk                                                                                                                                       |
| `NEXCONN_APP_KEY`                                                                    | Chat app ID                                            | All four together, or none                    | both | no                                       | Yes, if chat ships                                                                                                                                                |
| `NEXCONN_APP_SECRET`                                                                 | Chat server secret                                     | Together                                      | both | **yes**                                  | Yes, if chat ships                                                                                                                                                |
| `NEXCONN_PRIMARY_API_DOMAIN`, `NEXCONN_SECONDARY_API_DOMAIN`                         | Chat API domains                                       | Together                                      | both | no                                       | Yes, if chat ships                                                                                                                                                |
| `NEXCONN_TOKEN_TTL_SECONDS`, `NEXCONN_WEBHOOK_MAX_SKEW_MS`                           | Chat token and webhook timing                          | Optional                                      | both | no                                       | Optional                                                                                                                                                          |
| `AI_PROVIDER`, `AI_API_KEY`, `SMTP_URL`                                              | In `.env.example` only; no code reads them             | —                                             | —    | `AI_API_KEY`, `SMTP_URL` would be secret | No                                                                                                                                                                |
| `TEST_DATABASE_URL`                                                                  | Integration tests only                                 | —                                             | test | yes                                      | **Never**                                                                                                                                                         |

### Desktop (build-time only; set in the release build environment, not Railway)

| Variable                                                                   | Purpose                                       | Production requirement              | Secret |
| -------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------- | ------ |
| `BT_API_BASE_URL`                                                          | API origin built into Electron's main process | Required: public https, origin only | no     |
| `VITE_CLERK_PUBLISHABLE_KEY`                                               | Clerk frontend key                            | Required (`pk_live`)                | no     |
| `VITE_CLERK_FRONTEND_API_HOST`                                             | Clerk host allowed by the app's CSP           | Required in production              | no     |
| `VITE_API_BASE_URL`                                                        | Fallback outside Electron                     | Development only                    | no     |
| `BT_PROD`, `BT_SMOKE`                                                      | Run or smoke-test a built bundle locally      | Optional                            | no     |
| `ELECTRON_RENDERER_URL`, `CUE_API_BASE_URL`, `CUE_CLERK_FRONTEND_API_HOST` | Injected or derived by the build              | Never set by hand                   | no     |

## 6. Railway compatibility

| Area                           | Status                                                                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docker deploy                  | **BLOCKER** until a root Dockerfile exists (Railpack is the alternative path)                                                                                                                        |
| `PORT` handling                | **PASS**                                                                                                                                                                                             |
| Health check                   | **PASS**: use `/api/v1/health/ready`. Railway checks it during rollout only, not continuously.                                                                                                       |
| Private networking to Postgres | **PASS** (dual-stack bind). **BLOCKER** for TLS (§4).                                                                                                                                                |
| Outbound internet              | **NOT VERIFIED**: needed for Clerk, Nexconn, and the GitHub tarball at build time. Railway allows outbound by default.                                                                               |
| Restart and shutdown           | **NEEDS ATTENTION**: shutdown can take ~13s. Railway's drain window (believed to be `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`; confirm in Railway docs) must be ≥15s or the process is killed mid-drain. |
| Migration ordering             | **NEEDS ATTENTION**: pre-deploy `prisma migrate deploy` once per release, before traffic shifts; a failure stops the deploy. Needs the CLI in the image (§3).                                        |
| Replicas                       | **NEEDS ATTENTION**: rate limits are in-memory per process. Start with **one replica**.                                                                                                              |
| Logging                        | **PASS**: structured JSON to stdout/stderr                                                                                                                                                           |

## 7. Cloudflare compatibility

| Area                      | Status                                                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom domain             | **NEEDS ATTENTION**: point an API hostname (e.g. `api.<domain>`) at Railway's custom-domain target. **Choose it before the first desktop release**: the URL is built into the app, so changing it means re-releasing the desktop app.                                                                                                             |
| TLS                       | **NEEDS ATTENTION**: Cloudflare SSL mode **Full (strict)**. Flexible breaks HTTPS to the origin and can cause redirect loops.                                                                                                                                                                                                                     |
| CORS                      | **PASS**: main-process calls are not browser CORS requests; preflights are handled                                                                                                                                                                                                                                                                |
| Proxy and bot settings    | **NEEDS ATTENTION**: the desktop app (Node fetch) and Nexconn's webhook are not browsers. Bot Fight Mode or JS challenges on the API hostname would break both. Exempt the API host and `/api/v1/webhooks/*`.                                                                                                                                     |
| Clerk DNS                 | **NEEDS ATTENTION**: Clerk's production custom-domain records must be **DNS-only**, not proxied                                                                                                                                                                                                                                                   |
| Origin exposure           | **NEEDS ATTENTION**: the Railway origin (`*.up.railway.app`, and the Railway edge with your host) stays reachable without Cloudflare, bypassing its WAF and rate limits. Mitigate with a Cloudflare-added secret header checked by the API, or accept the risk explicitly.                                                                        |
| Client IP and rate limits | **NEEDS ATTENTION**: `TRUST_PROXY_HOPS` must match the real chain (Railway only ≈ 1; Cloudflare + Railway ≈ 2; **NOT VERIFIED**). If wrong, or if the origin can be bypassed, clients can forge `X-Forwarded-For` and evade the IP-based limits. Prefer `CF-Connecting-IP` only on verified Cloudflare traffic, plus Cloudflare rate-limit rules. |

## 8. Test results (actual runs, 2026-11-08)

| Check                                                          | Result                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck` (shared, desktop, API)                        | **PASS**                                                                                                                       |
| `pnpm lint`                                                    | **PASS**                                                                                                                       |
| `pnpm format:check`                                            | **FAIL** at audit time: `docs/development/implementation-log.md` only (docs; reformatted when this report was saved)           |
| API unit tests (`test:unit`)                                   | **PASS**: 10 files, 58 tests                                                                                                   |
| API production compile (`tsc -p tsconfig.build.json --noEmit`) | **PASS**                                                                                                                       |
| Desktop tests                                                  | **PASS**: 14 files, 111 tests                                                                                                  |
| `pnpm audit --prod`                                            | **PASS**: no known vulnerabilities                                                                                             |
| API integration suite                                          | **NOT VERIFIED**: no isolated `cue_test` database exists locally; running it needs a new database plus migrations (prohibited) |
| Docker build, container smoke, Railway, Cloudflare             | **NOT VERIFIED** (nothing to build; nothing provisioned)                                                                       |
| Desktop production build                                       | **NOT VERIFIED**: fails by design until a real `BT_API_BASE_URL` exists                                                        |

**Clerk adapter unit test (known failure) — investigated.** It now **PASSES**: 6/6 in three
isolated runs, inside the full unit run, and under the integration config (`vitest.config.ts`).

- **Cause:** test isolation. The global integration setup (`src/test/setup.ts`) imported the real
  Clerk adapter before this file registered its `@clerk/backend` mock, so the mock never applied
  and the fake token was rejected as `INVALID_SESSION`.
- **Fix:** commit `6f9f340` added `vi.resetModules()` in `clerk.unit.test.ts`. The production
  adapter and its verification options were not changed.
- **Status:** resolved and verified under both configurations.

## 9. Blockers and risks

**Blockers**

1. No Dockerfile or `.dockerignore`; nothing builds an API image.
2. No runtime-image answer yet for the Prisma CLI (pre-deploy migration) or the generated client
   (lost when the image is pruned).
3. `DATABASE_SSL_MODE=verify-full` is required in production; Railway Postgres likely cannot
   satisfy it. Decision needed.
4. Production values do not exist yet: API domain, Clerk production instance, `CORS_ORIGIN`,
   `TRUST_PROXY_HOPS`, `BT_API_BASE_URL`.

**Risks**

- `SESSION_SECRET` is required at production startup but used by nothing (legacy).
- `PUBLIC_APP_BASE_URL` defaults to localhost in production, so invitation links would point at
  localhost; invitation email delivery is dev-only (link shown in the UI).
- Node version not pinned.
- The Railway origin is reachable around Cloudflare.
- Railway may kill the process before the ~13s shutdown completes.
- No backup schedule or restore drill.
- Integration tests not run.
- The Clerk dev instance forced organization selection (fixed 2026-11-08); the production instance
  must be checked the same way, and `CLERK_AUTHORIZED_PARTIES` must include `app://bundle`.

## 10. Recommended Phase 0 remediation tasks

Each requires approval before implementation.

1. **Pin Node 24 LTS** (matches the tested 24.13): `.nvmrc` plus `engines` in the root and API
   packages.
2. **Add a root `Dockerfile` and `.dockerignore`:** multi-stage on `node:24-bookworm-slim` (glibc,
   for argon2), corepack `pnpm@11.8.0`, frozen install filtered to `@buildtogether/api...`, then
   `prisma generate` and the API build; runtime stage as `USER node` with
   `CMD ["node","dist/index.js"]`. `.dockerignore` excludes `.env*`, `docs/`, `apps/desktop`,
   `**/node_modules`, `**/dist` and `.git`.
3. **Choose the Prisma image strategy:** (a) keep the Prisma CLI and generated client in the runtime
   image, or (b) switch to the `prisma-client` generator with an explicit output so `dist` is
   self-contained. Then confirm `prisma migrate deploy` runs from the image.
4. **Add an API script `db:migrate:deploy` → `prisma migrate deploy`**, used only as Railway's
   pre-deploy command.
5. **Decide database TLS in a disposable Railway project:** test `verify-full` against Railway
   Postgres (with `DATABASE_SSL_ROOT_CERT` if needed). If it fails, choose a Postgres provider with
   a CA-signed certificate, or approve a documented, narrowly scoped exception for Railway's private
   network. Never loosen the check silently.
6. **Set Railway's drain window to ≥15s** and confirm SIGTERM reaches node in the container.
7. **Retire `SESSION_SECRET` and the unused token-TTL variables** (or document generating a random
   value); remove or mark the `AI_*` and `SMTP_URL` placeholders.
8. **Add a production check for `PUBLIC_APP_BASE_URL`** (https, not localhost), or define what
   invitation links should point to.
9. **Decide the Cloudflare setup:** SSL Full (strict); API host exempt from bot challenges; Clerk
   records DNS-only; origin protection via a secret header; client-IP handling and the matching
   `TRUST_PROXY_HOPS`.
10. **Choose the final API custom domain** before the first desktop release.
11. **Create a local `cue_test` database and run the full integration suite** (needs migrations on a
    local test database — explicit approval required).
12. **Add CI** running filtered builds (not root `pnpm build`), typecheck, lint, unit tests and the
    Docker build.
13. **Enable Railway Postgres backups and run one restore drill** before any user data goes in.
14. **Configure the Clerk production instance:** Native API on, organization selection off,
    `app://bundle` allow-listed, and `CLERK_JWT_ISSUER` / `CLERK_AUTHORIZED_PARTIES` matching it.
