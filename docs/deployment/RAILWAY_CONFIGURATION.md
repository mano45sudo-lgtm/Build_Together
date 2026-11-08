# Railway API Service Configuration

This is the proposed configuration only. No Railway account/project/service/domain/database was
created or modified. Railway's generated HTTPS domain is the initial API domain; no custom domain
or Cloudflare is part of this plan.

## Service setup

| Setting            | Proposed value                                                                                                                                                                       | Status                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Source             | Existing repository                                                                                                                                                                  | NEEDS USER ACTION                                                         |
| Root directory     | `/` (repository root), because the pnpm lockfile, workspace manifest, package manager declaration, and shared package are at root                                                    | READY BY REPOSITORY STRUCTURE                                             |
| Builder            | Railway Railpack/Node auto-detection; no Dockerfile is needed for this layout                                                                                                        | NEEDS USER ACTION                                                         |
| Install            | Let Railpack detect root pnpm lockfile and `packageManager: pnpm@11.8.0`; verify frozen-lockfile install in deployment logs                                                          | NEEDS CONFIGURATION                                                       |
| Node               | Pin a Prisma-supported Node LTS. Current repo says only `>=20`; local observed runtime is `24.13.1`. Add a repo version pin only in the implementation phase and test it in Railway. | NEEDS IMPLEMENTATION                                                      |
| Build command      | `pnpm --filter @buildtogether/api prisma:generate && pnpm --filter @buildtogether/api build`                                                                                         | VERIFIED LOCALLY; API build builds shared first                           |
| Start command      | `pnpm --filter @buildtogether/api start`                                                                                                                                             | VERIFIED LOCALLY through API listen; production infrastructure unverified |
| Pre-deploy command | `pnpm --filter @buildtogether/api exec prisma migrate deploy`                                                                                                                        | NEEDS USER ACTION; only after backup, review, and staged validation       |
| Healthcheck path   | Candidate `/api/v1/health/ready`; `/api/v1/health` remains process liveness                                                                                                          | IMPLEMENTED LOCALLY; DB/TLS behavior unverified                           |
| Port               | Railway injects `PORT`; current API reads it and defaults to 4000 for local dev.                                                                                                     | READY WITH GAP: explicit bind host/range validation not implemented       |
| Database           | Railway PostgreSQL service on private networking; reference its private `DATABASE_URL` from API service variables                                                                    | NEEDS USER ACTION                                                         |
| Public API URL     | Railway-generated HTTPS API domain                                                                                                                                                   | NEEDS USER ACTION after service exists                                    |

The install/build/start commands are root-relative, matching Railway's monorepo service model.
Railway supports service-specific root/build/start settings and a separate Pre-Deploy Command;
pre-deploy runs with the service's variables and private network, and a failing command prevents the
deploy from proceeding. Links: [monorepo deployments](https://docs.railway.com/deployments/monorepo),
[build configuration](https://docs.railway.com/builds/build-configuration),
[pre-deploy command](https://docs.railway.com/deployments/pre-deploy-command),
[healthchecks](https://docs.railway.com/deployments/healthchecks).

## API runtime imports — Phase 1 fix

The original failure was caused by `@buildtogether/shared` exporting `src/index.ts` directly and
having no runtime build. Its ESM barrel also used extensionless relative exports, which Node cannot
resolve. The API uses `ROLE_RANK` at runtime, so TypeScript-only resolution was insufficient.

Phase 1 adds a shared-package ESM build with declarations at `packages/shared/dist`, points the
package's `types`/`import`/`default` exports at generated files, and uses explicit `.js` relative
specifiers. The API `build` script runs the shared build before API TypeScript compilation; its
production TypeScript build uses `NodeNext`, which catches extensionless imports that plain Node
would reject. The existing root-relative Railway build and start commands remain:

```sh
pnpm --filter @buildtogether/api prisma:generate && pnpm --filter @buildtogether/api build
pnpm --filter @buildtogether/api start
```

Local verification: shared build, Prisma client generation, API production build, API-context Node
resolution of `@buildtogether/shared` to `packages/shared/dist/index.js`, and compiled API startup to
its listen callback all passed. Startup used the committed local placeholder database URL and made
no DB request. API tests were attempted but could not run successfully because PostgreSQL was
unavailable at `localhost:5432` and this environment denied loopback test-server connections
(`EACCES`). No Railway deployment or clean Railpack build was performed. Successful compilation and
local startup do not establish database, Clerk, Nexconn, or deployment readiness.

## Health/readiness and replicas

Railway healthchecks accept a 2xx response during deployment and do not continuously monitor after
the deployment is active. `/api/v1/health` reports process liveness; `/api/v1/health/ready` performs
a bounded `SELECT 1` through the Prisma singleton and returns sanitized 503 when unavailable. The
candidate path is implemented locally but must not be configured until safe disposable-database and
target TLS checks pass. Start with one API replica. Pool defaults are max 5 clients/process, 5-second
connection timeout, and 10-second idle timeout. Set `DATABASE_POOL_MAX` based on total allowed
connections: maximum pool × maximum API replicas + migration/admin headroom. Shutdown allows 8
seconds for HTTP drain, closes remaining connections, then gives Prisma disconnect 5 seconds; verify
Railway's termination window accommodates this.

Production must set `DATABASE_SSL_MODE=verify-full`. This verifies the DB certificate chain and
hostname. Set `DATABASE_SSL_ROOT_CERT` to an absolute CA file path only if the target's CA is not in
the runtime trust store. Do not use `rejectUnauthorized=false` or libpq TLS modes such as `require`
as a substitute. Runtime and Prisma CLI use one resolver, but the exact Railway URL/TLS behavior
has not been verified against a live database.

## Variables and release sequence

Set the API variables listed in `PRODUCTION_ENVIRONMENT.md` through Railway Variables, never in the
repo. Set `NODE_ENV=production`, reference the private DB URL, configure Clerk and (if enabled)
Nexconn, then generate the Railway HTTPS domain. Keep credentials private. Do not execute the
pre-deploy migration command against an unknown/existing DB until `DATABASE_MIGRATION_PLAN.md` has
been followed.

The old unverified URL `https://api.buildtogether.app` was removed. Production desktop builds now
require `BT_API_BASE_URL` at build time and embed the validated public HTTPS origin in the trusted
Electron main process. The installed client does not load `.env` at runtime; rebuild the release
with the verified service origin after that value is known.

## CI and deployment automation

No `.github/workflows`, Railway config, Dockerfile, or deployment script was found. Add CI to run
typecheck/lint/API tests/build, and a controlled migration/deploy step only in the separately
authorized implementation phase. Configure watch paths for API/shared/lockfile changes only after
confirming the repository's source connection.

# Phase 4 production configuration addendum

No Railway project or service was created. When separately authorized, configure the API variables
listed in [`PRODUCTION_ENVIRONMENT.md`](./PRODUCTION_ENVIRONMENT.md) in the API service's private
environment. In particular, provide the real `CORS_ORIGIN`, `TRUST_PROXY_HOPS` matching the actual
proxy topology, `DATABASE_SSL_MODE=verify-full`, Clerk production values, and all four Nexconn values
if chat is included. Keep secrets in the platform's secret variable store. The desktop API origin is
not an API runtime variable: supply `BT_API_BASE_URL=https://<verified-api-origin>` to the controlled
Windows release build before packaging.

The health endpoints are `/api/v1/health` (liveness) and `/api/v1/health/ready` (database readiness).
Do not mark Railway configured or production-ready until the actual deployment, TLS, health check,
private networking, pool budget and migration plan are verified in a separately approved phase.
