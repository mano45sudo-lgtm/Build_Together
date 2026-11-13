# Railway API Service Configuration

> **Superseded (2026-11-13):** Cue deploys to AWS — see [`AWS_DEPLOYMENT.md`](./AWS_DEPLOYMENT.md). Kept for reference only.

Proposed configuration for the Cue API on Railway, reconciled with the root Docker image in Batch
0D-A (2026-11-08). No Railway account, project, service, domain, database or variable has been
created or modified. Values in angle brackets are owner-supplied; none are invented here.

This replaces the earlier Railpack/pnpm plan: the runtime image contains no pnpm, so `pnpm …`
start or pre-deploy commands would fail.

## Service setup

| Setting            | Value                                                                                                                          | Status                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Source             | This repository                                                                                                                | Owner action                                                                 |
| Root directory     | `/` (repository root) — the build context must include the lockfile, workspace manifest and `packages/shared`                  | Required by the image                                                        |
| Builder            | Dockerfile: the root [`Dockerfile`](../../Dockerfile) (see [`DOCKER_IMAGE.md`](./DOCKER_IMAGE.md))                             | Verified locally; confirm the Railway build log shows the Dockerfile builder |
| Build arguments    | None required (`NODE_VERSION`, `PNPM_VERSION` have defaults). Never pass secrets as build arguments                            | Verified: the Dockerfile declares no secret args                             |
| Start command      | Leave unset — the image runs `CMD ["node", "dist/index.js"]` from `/app`. If one must be set, use exactly `node dist/index.js` | Verified in a local container                                                |
| Pre-deploy command | `npm run db:migrate:deploy` (runs `prisma migrate deploy` from `/app`)                                                         | Verified locally against disposable TLS PostgreSQL                           |
| Pre-deploy timeout | Set explicitly (e.g. 600 s); Railway's default is unlimited                                                                    | Owner action                                                                 |
| Healthcheck path   | `/api/v1/health/ready` (database readiness; 200 ready, 503 not ready)                                                          | Verified locally                                                             |
| Liveness           | `/api/v1/health` (process only; no database)                                                                                   | Verified locally                                                             |
| Port               | Railway injects `PORT`; the API listens on it (image default 4000). Do not set `PORT` by hand                                  | Verified locally with injected ports                                         |
| Replicas           | Start with **one**: rate limits are in-memory per process                                                                      | Recommendation                                                               |
| Public domain      | `<api-domain>` chosen before the first desktop release (it is built into the app as `BT_API_BASE_URL`)                         | Owner action                                                                 |

## Release order

1. Railway builds the root `Dockerfile` (repository root as context).
2. **Pre-deploy:** `npm run db:migrate:deploy` runs in a separate container from the same image,
   with the service's variables and private network, no volumes. Non-zero exit stops the deploy
   (not retried). It prints the target database and host before acting — check the log.
3. The new deployment starts (`node dist/index.js`) and must pass `/api/v1/health/ready` before
   it receives traffic.

Migrations must be backward compatible with the release still serving traffic (expand → deploy →
contract). **Take a database backup before every deploy that includes a schema change**; a failed
migration is recorded in `_prisma_migrations` and needs manual review (`prisma migrate resolve`) —
there is no automatic rollback. Details: [`DATABASE_DEPLOYMENT.md`](./DATABASE_DEPLOYMENT.md).

## Shutdown and drain

The image's PID 1 is `node`, so SIGTERM reaches the API directly: it stops accepting connections,
drains in-flight HTTP for up to 8 s, then disconnects Prisma within 5 s (≈13 s worst case). Railway's
drain window between SIGTERM and SIGKILL must be at least **15 s** — confirm the setting name and
default in Railway's documentation and set it explicitly (NOT VERIFIED).

## Variables

Set the API variables from [`PRODUCTION_ENVIRONMENT.md`](./PRODUCTION_ENVIRONMENT.md) in the
service's variables (secrets as sealed/secret variables). Production minimum:

- `NODE_ENV=production` (also the image default; any unsupported value refuses to start).
- `DATABASE_URL` — reference the private PostgreSQL URL; never the public proxy (see TLS).
- `DATABASE_SSL_MODE=verify-full`, plus the CA for a private-CA database (see TLS).
- `TRUST_PROXY_HOPS=<count of the verified proxy chain>`.
- `CLERK_SECRET_KEY` (production-instance key; `sk_test_` is refused), `CLERK_JWT_ISSUER`,
  `CLERK_AUTHORIZED_PARTIES` (including `app://bundle`).
- Optional: `CORS_ORIGIN=app://bundle` so the packaged desktop's status indicator can read health;
  the four `NEXCONN_*` values together if chat ships.

Do not set `SESSION_SECRET`, `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS` (removed) or
`PUBLIC_APP_BASE_URL` (ignored in production). The pre-deploy container uses the same variables, so
migrations and the API resolve the same database and TLS policy.

## Database TLS

Production requires `DATABASE_SSL_MODE=verify-full` for both the API (`pg`) and migrations (the
Prisma CLI receives the equivalent strict mode). Railway's PostgreSQL image signs its server
certificate with a private CA whose SANs are `localhost` and the private domain only, so:

- connect over the private network using a hostname present in the certificate;
- the CA must be present as a file in **both** the API and pre-deploy containers — **open
  blocker**; the proposed delivery design is in [`DATABASE_DEPLOYMENT.md`](./DATABASE_DEPLOYMENT.md);
- plan CA rotation (the image regenerates its CA near expiry).

Live Railway TLS behaviour is NOT VERIFIED; the verification plan is in `DATABASE_DEPLOYMENT.md`.

## Not done here

No Railway project, service, database, domain, variables or deployment exists. CI, Cloudflare,
monitoring and backups are separate, later phases. Production remains **NO-GO** until the database
CA blocker is resolved and the live verification plan passes.
