# CUE Cloud Deployment Plan — Phase 0 Audit

**Status: NOT READY TO DEPLOY.** This is an inspection and planning document only. No Railway
project/database was created, no production credentials were read or copied, and no deployment,
DNS change, or migration was performed.

## Verified repository layout

| Item                    | Finding                                                                                                                              | Status                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| Workspace               | pnpm workspace rooted at repository root; `apps/*` and `packages/*`                                                                  | READY                                   |
| Package manager         | pnpm `11.8.0` pinned by root `packageManager`; `pnpm-lock.yaml` uses lockfile v9                                                     | READY                                   |
| Local runtime observed  | Node `v24.13.1`; root only declares `node >=20`, no `.nvmrc`/`.node-version`                                                         | NEEDS IMPLEMENTATION                    |
| API root                | `apps/api`; Express 5 + TypeScript                                                                                                   | READY                                   |
| Desktop root            | `apps/desktop`; Electron + React/Vite                                                                                                | READY                                   |
| Shared package          | `packages/shared`; built to ESM JavaScript + declarations with explicit relative `.js` imports and package exports                   | PHASE 1 FIX VERIFIED LOCALLY            |
| API entry/output        | `apps/api/src/index.ts` → `apps/api/dist/index.js` (`tsconfig.build.json`, NodeNext)                                                 | BUILD PASSES; runtime imports verified  |
| Production start script | `pnpm --filter @buildtogether/api start` → `node dist/index.js`                                                                      | STARTED LOCALLY through listen callback |
| Prisma                  | Prisma 7; schema in `apps/api/prisma/schema.prisma`, CLI config in `apps/api/prisma.config.ts`, `@prisma/adapter-pg` runtime adapter | READY WITH GAPS                         |
| Migrations              | 8 ordered PostgreSQL migrations                                                                                                      | NEEDS DATABASE VERIFICATION             |
| Deployment automation   | No Railway config, Dockerfile, deploy scripts, or GitHub workflow found                                                              | NEEDS CONFIGURATION                     |

## Readiness summary

| Area                           | Status               | Evidence / gap                                                                                                                                                        |
| ------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Independent API service        | PARTIALLY VERIFIED   | Phase 1 fixed shared/API ESM imports and local startup. API tests need unavailable PostgreSQL; production infra/configuration remains unverified.                     |
| Railway service configuration  | NEEDS CONFIGURATION  | Commands/root path are documented in `RAILWAY_CONFIGURATION.md`; no service exists and no Railway settings were changed.                                              |
| PostgreSQL rollout             | NEEDS USER ACTION    | No production DB state is known. Back up/restore and migration procedures are in `DATABASE_MIGRATION_PLAN.md`.                                                        |
| Clerk production auth          | NEEDS USER ACTION    | Code uses Clerk; dashboard instance, production keys/origins, first-login provisioning, and email verification must be confirmed. See `AUTHENTICATION_DEPLOYMENT.md`. |
| Nexconn production chat        | NEEDS USER ACTION    | Four server settings are required together for the current provider adapter; live credentials/account callback configuration are unknown.                             |
| Desktop-to-Railway URL         | NEEDS IMPLEMENTATION | `BT_API_BASE_URL` overrides the old fallback, but the packaged app does not load `.env`; a supported installed-app production configuration is missing.               |
| Health/readiness               | NEEDS IMPLEMENTATION | `/api/v1/health` checks only that the process answers; there is no DB readiness endpoint.                                                                             |
| Production operations/security | NEEDS IMPLEMENTATION | Graceful shutdown does not explicitly disconnect Prisma; error logging, security headers, rate-limit topology, backup/restore, and monitoring need production review. |

## Nexconn configuration and boundaries

- The server-side `@nexconn/server-sdk` is isolated in `apps/api/src/modules/chat/nexconn.provider.ts`.
  Its current adapter configures only when `NEXCONN_APP_KEY`, `NEXCONN_APP_SECRET`,
  `NEXCONN_PRIMARY_API_DOMAIN`, and `NEXCONN_SECONDARY_API_DOMAIN` are all present. The template's
  statement that domains are optional does not match this constructor.
- The API mints a user-scoped token after Clerk authentication and workspace membership checks. The
  response includes the public App Key, short-lived token, deterministic caller ID, and expiry; the
  App Secret stays server-side. Electron initializes the client SDK with the App Key and connects
  with that token. Message transport is renderer-to-Nexconn; Cue stores conversation/participant
  metadata and provider references, not message bodies.
- Conversation endpoints verify workspace membership and conversation participant/creator rules.
  The current API webhook at `/api/v1/webhooks/nexconn` is unauthenticated by user Bearer token but
  checks a signature and timestamp window, compares signatures in constant time, and records
  idempotent bounded event references. The handler does not pass an App-Key field for validation;
  verify whether the live provider contract requires one and address that in Phase 1 if so.
- No production Nexconn credentials/account settings were inspected and no live provider call was
  made. Required variables and remaining account configuration are listed in
  `PRODUCTION_ENVIRONMENT.md` and `PRODUCTION_SECURITY_CHECKLIST.md`.

## Remaining deployment work (separate authorization required)

1. Validate a clean Railway/Railpack workspace install and build, then pin a supported Node LTS
   version and verify it in that environment.
2. Add a database-aware readiness endpoint and shutdown that drains HTTP requests and disconnects
   the PostgreSQL pool within the platform's termination window.
3. Pin a supported Node LTS version, keep the workspace lockfile install reproducible, and verify
   the Railway build/install/start commands in a clean environment.
4. Decide whether to remove or formally retire legacy self-managed auth schema/code; validate
   verified-email provisioning and explicit legacy-account linking.
5. Resolve the destructive temporary SQL script in `apps/api/prisma/` before any migration job.
6. Create/configure Railway and a private PostgreSQL service only after user approval; configure
   secrets in Railway Variables, backups, healthcheck, and a reversible first migration plan.
7. Deploy to Railway only in the separately authorized phase; record the generated HTTPS domain,
   then provide it to the Windows client through supported configuration without baking a temporary
   URL into the client.
8. Verify Clerk production origins and the real packaged Windows sign-in flow; configure Nexconn
   keys/domains/webhook callback only if live chat is part of the initial release.

Phase 1 import/runtime work is documented in `RAILWAY_CONFIGURATION.md`. The remaining items above
are not part of that scoped fix and are not authorization to create or change infrastructure.
