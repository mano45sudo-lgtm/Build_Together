# Cue API Docker Image (Batch 0A)

Root-level [`Dockerfile`](../../Dockerfile) and [`.dockerignore`](../../.dockerignore). The build
context is the **repository root** (lockfile, workspace manifest and `@buildtogether/shared` live
there).

```sh
docker build -t cue-api .
docker run --rm -p 4000:4000 --env-file <private env file> cue-api
```

## Stages

| Stage     | From                    | Contents                                                                                                                                                                                                                                                                                                                                                       |
| --------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `os`      | `node:24-bookworm-slim` | Debian bookworm (glibc) + `openssl` (Prisma schema engine) + `ca-certificates`. Shared by build and runtime.                                                                                                                                                                                                                                                   |
| `base`    | `os`                    | Corepack + `pnpm@11.8.0`. Build tooling only.                                                                                                                                                                                                                                                                                                                  |
| `build`   | `base`                  | Manifests + lockfile → `pnpm install --frozen-lockfile --filter "@buildtogether/api..."` (BuildKit cache for the pnpm store) → sources → `prisma generate` → API build (builds shared first) → `pnpm deploy --prod --legacy /out` → copy `dist`, shared `dist`, `prisma/`, `prisma.config.ts`, `src/lib/database-config.ts` → `prisma generate` inside `/out`. |
| `runtime` | `os`                    | `/app` (the deployed directory) owned by `node`; `USER node`; `NODE_ENV=production`, default `PORT=4000`; `STOPSIGNAL SIGTERM`; `CMD ["node", "dist/index.js"]`. No pnpm.                                                                                                                                                                                      |

## Design notes

- **Prisma CLI is a runtime dependency** (moved from devDependencies, same 7.10.1). `pnpm deploy
--prod` would otherwise drop it, and the release step will run `prisma migrate deploy` from this
  image. The image never runs migrations itself. `prisma.config.ts` imports
  `src/lib/database-config.ts` and `src/lib/runtime-environment.ts`, so those two source files ship
  too.
- **`--legacy` deploy:** pnpm 10+ otherwise requires `inject-workspace-packages` for the whole
  workspace, which would change how local development links `@buildtogether/shared`.
- **Native/glibc:** the install runs on Linux, so any native package resolves its glibc build (the
  unused `@node-rs/argon2` was removed in Batch 0D-A); the Prisma client uses the WASM query
  compiler; the schema engine is `debian-openssl-3.0.x`.
- **Build network:** npm registry, Prisma engine downloads, and the Nexconn SDK tarball from
  `codeload.github.com` (pinned commit, built by its `prepare` script). No `git` needed.
- **Signals:** exec-form `CMD` makes node PID 1, so SIGTERM/SIGINT reach the API's graceful
  shutdown (HTTP drain ≤8s, Prisma disconnect ≤5s). The platform's stop timeout must be ≥15s.
- **`.dockerignore`** is an allow-list (root manifests, `tsconfig.base.json`, `apps/api`,
  `packages/shared`, desktop `package.json` only) with explicit exclusions for `.env*`, keys,
  `node_modules`, build output, tests, `docs/`, `.git`.

## Verified locally (2026-11-08)

Image `cue-api:batch0a`, Node v24.22.2, placeholder production variables (unreachable database host,
dummy Clerk values, no real secrets):

| Check                                      | Result                                                              |
| ------------------------------------------ | ------------------------------------------------------------------- |
| Starts in production mode                  | `api listening` on the injected `PORT` (8080, 9090)                 |
| Non-root                                   | `uid=1000(node)`; PID 1 is `node dist/index.js`                     |
| `/api/v1/health`                           | 200                                                                 |
| `/api/v1/health/ready`                     | 503 `DATABASE_NOT_READY` (no database, as intended)                 |
| Unknown route / unauthenticated `/auth/me` | 404 envelope / 401 `UNAUTHENTICATED`                                |
| SIGTERM (`docker stop`) / SIGINT           | `shutting down` → `shutdown complete`, exit 0 (≈1.6s)               |
| Production guards                          | `DATABASE_SSL_MODE=disable` and missing Clerk values refuse to boot |
| Prisma CLI in image                        | Loads `prisma.config.ts`; `prisma validate` passes; no DB contact   |
| Secrets / stray files                      | No `.env*` or keys; no tests, docs, desktop or quarantined SQL      |

Size: `/app` ≈ 424 MB on disk, mostly the Prisma CLI's dependency tree (Studio, Effect, TypeScript,
PGlite). Compressed image content ≈ 191 MB; `docker images` reports 875 MB unpacked.

## Outstanding

- Pin the base image by digest (the `24` tag floats: built with Node 24.22.2).
- A separate, smaller migration image (or CLI-free runtime) would cut most of the size; revisit with
  the migration design in Batch 0B.
- Not yet verified: a real database (TLS `verify-full`), Railway build/runtime, outbound access.

## Batch 0B additions

- `npm run db:migrate:deploy` runs `prisma migrate deploy` from the image (Railway pre-deploy
  command); `NPM_CONFIG_UPDATE_NOTIFIER=false` keeps it from contacting the npm registry.
- The CLI's TLS is now strict (chain + hostname); see
  [`DATABASE_DEPLOYMENT.md`](./DATABASE_DEPLOYMENT.md).
