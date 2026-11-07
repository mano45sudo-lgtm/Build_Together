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
| Healthcheck path   | Current `/api/v1/health`                                                                                                                                                             | NEEDS IMPLEMENTATION: process-only check, not DB readiness                |
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
the deployment is active. Current `/api/v1/health` only reports process uptime; it does not query
PostgreSQL. Add a bounded `/api/v1/ready` check that proves DB connectivity before configuring it as
the deployment healthcheck, while keeping liveness lightweight. Start with one API replica. Before
adding replicas, budget database connections and rate-limit storage across all replicas.

## Variables and release sequence

Set the API variables listed in `PRODUCTION_ENVIRONMENT.md` through Railway Variables, never in the
repo. Set `NODE_ENV=production`, reference the private DB URL, configure Clerk and (if enabled)
Nexconn, then generate the Railway HTTPS domain. Keep credentials private. Do not execute the
pre-deploy migration command against an unknown/existing DB until `DATABASE_MIGRATION_PLAN.md` has
been followed.

The Windows app currently falls back to the unverified old URL `https://api.buildtogether.app`.
`BT_API_BASE_URL` is read at runtime, but there is no installer/user configuration mechanism that
sets it for installed users, and `.env` is excluded from the installer. A supported runtime
configuration source is still needed before the release operator can set the Railway URL without
scattering a temporary domain through source files.

## CI and deployment automation

No `.github/workflows`, Railway config, Dockerfile, or deployment script was found. Add CI to run
typecheck/lint/API tests/build, and a controlled migration/deploy step only in the separately
authorized implementation phase. Configure watch paths for API/shared/lockfile changes only after
confirming the repository's source connection.
