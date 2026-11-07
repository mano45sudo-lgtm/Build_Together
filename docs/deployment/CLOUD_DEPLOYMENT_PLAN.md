# CUE Cloud Deployment Plan — Phase 0/2 Audit

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

## Phase 2 — Clerk authentication production audit

**Status: AUDIT COMPLETE; AUTHENTICATION NOT PRODUCTION-VERIFIED.** This phase inspected the
Electron-to-API auth path, Clerk token verification, email selection, first-login provisioning,
workspace authorization, legacy auth remnants and required environment configuration. It made
documentation changes only. No Clerk Dashboard, production database, credentials, Railway
resources, or live auth provider were accessed.

Key source findings and detailed test requirements are in
[`AUTHENTICATION_DEPLOYMENT.md`](./AUTHENTICATION_DEPLOYMENT.md) and
[`PRODUCTION_SECURITY_CHECKLIST.md`](./PRODUCTION_SECURITY_CHECKLIST.md). Release blockers
include unverified email selection during first provisioning, optional issuer/authorized-party
verification, the mismatch between JWT-key-only startup and Backend API provisioning, and
unverified production Clerk dashboard/CSP/native OAuth settings. The `app://bundle/` callback
is structurally consistent with Clerk's documented Electron scheme/host callback, but the
packaged production Windows flow has not been tested. Clerk's production instance domain is
separate from that app callback.

No critical authentication bypass was confirmed in the reviewed source; that is not a
penetration-test result. Membership and role checks are database-backed in source, but
production behavior and complete integration coverage remain unverified.

## Phase 2.1 — Clerk authentication hardening

**Status: CODE HARDENING COMPLETE; LIVE PRODUCTION AUTH NOT VERIFIED.** The API now rejects
unverified-email provisioning, refreshes verified identity profiles safely, forces a fresh
verified profile before invitation lookup/acceptance, requires production Clerk provisioning
secret/issuer/authorized-party configuration, and uses a validated exact Frontend API hostname
for Clerk-related Electron CSP sources. A loopback-only `TEST_DATABASE_URL` guard verifies the
connected database name before test cleanup. Details and required manual settings are in
[`AUTHENTICATION_DEPLOYMENT.md`](./AUTHENTICATION_DEPLOYMENT.md).

API unit tests (5 files / 31 tests), desktop tests (9 files / 50 tests), shared/API/desktop
typechecks, API production TypeScript build, Electron development-mode build, and workspace lint passed. Integration tests were
not run because no isolated test database was configured or confirmed; no database was
connected to or reset. The production desktop build needs the actual
`VITE_CLERK_FRONTEND_API_HOST` from the Clerk configuration owner. Dashboard, live token, email,
Google OAuth, packaged Windows callback, and production API behavior remain unverified.

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
4. Supply the actual production Clerk issuer, authorized parties, API Secret Key, desktop
   publishable key, and Frontend API hostname through their intended secure configuration
   channels; verify Dashboard settings and packaged Windows email/Google OAuth flows. No values
   are guessed or stored by this audit.
5. Inventory legacy accounts and decide whether to retire self-managed auth schema/code; define
   explicit user-verified linking before any schema cleanup.
6. Resolve the destructive temporary SQL script in `apps/api/prisma/` before any migration job.
7. Create/configure Railway and a private PostgreSQL service only after user approval; configure
   secrets in Railway Variables, backups, healthcheck, and a reversible first migration plan.
8. Deploy to Railway only in the separately authorized phase; record the generated HTTPS domain,
   then provide it to the Windows client through supported configuration without baking a temporary
   URL into the client.
9. Configure Nexconn keys/domains/webhook callback only if live chat is part of the initial release.

Phase 1 import/runtime work is documented in `RAILWAY_CONFIGURATION.md`. Phase 2's audit is
documented above; fixes, dashboard changes, and remaining deployment items are separate work
requiring their own authorization. Nothing in this plan authorizes infrastructure creation or
deployment.
