# CUE Cloud Deployment Plan — Phases 0–3.2

**Status: NOT READY TO DEPLOY.** This plan records prior audits, Phase 3.1 local API changes and
Phase 3.2 disposable PostgreSQL migration validation. No Railway project or production database was
created or contacted, no production credentials were read or copied, and no deployment, DNS change
or production migration was performed.

## Verified repository layout

| Item                  | Finding                                                                                                                           | Status                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Workspace             | pnpm workspace rooted at repository root; `apps/*` and `packages/*`                                                               | READY                                       |
| Package manager       | pnpm `11.8.0` pinned by root `packageManager`; `pnpm-lock.yaml` uses lockfile v9                                                  | READY                                       |
| Node runtime          | Node 24 pinned: `.nvmrc`, root and API `engines >=24.0.0 <25`; image `node:24-bookworm-slim`                                      | PINNED (Batch 0A)                           |
| API root              | `apps/api`; Express 5 + TypeScript                                                                                                | READY                                       |
| Desktop root          | `apps/desktop`; Electron + React/Vite                                                                                             | READY                                       |
| Shared package        | `packages/shared`; built to ESM JavaScript + declarations with explicit relative `.js` imports and package exports                | PHASE 1 FIX VERIFIED LOCALLY                |
| API entry/output      | `apps/api/src/index.ts` → `apps/api/dist/index.js` (`tsconfig.build.json`, NodeNext)                                              | BUILD PASSES; runtime imports verified      |
| Production start      | Docker image `CMD ["node", "dist/index.js"]` (WORKDIR `/app`; no pnpm in the runtime image)                                       | VERIFIED IN LOCAL CONTAINER                 |
| Prisma                | Prisma 7; CLI/runtime share `DATABASE_URL`; explicit bounded `PrismaPg` pool and verified TLS mode                                | IMPLEMENTED LOCALLY; live target unverified |
| Migrations            | 8 ordered PostgreSQL migrations; disposable PostgreSQL 16.14 run applied all and schema diff was empty; dangerous SQL quarantined | LOCAL VALIDATION PASS; production NO-GO     |
| Deployment automation | Root `Dockerfile` + `.dockerignore`; pre-deploy `npm run db:migrate:deploy`; no CI workflow yet                                   | IMAGE READY; CI NEEDS CONFIGURATION         |

## Readiness summary

| Area                           | Status               | Evidence / gap                                                                                                                                                                        |
| ------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Independent API service        | PARTIALLY VERIFIED   | Phase 1 fixed shared/API ESM imports and local startup. Disposable migration validation passed; API integration tests and production infra/configuration remain unverified.           |
| Railway service configuration  | NEEDS CONFIGURATION  | Commands/root path are documented in `RAILWAY_CONFIGURATION.md`; no service exists and no Railway settings were changed.                                                              |
| PostgreSQL rollout             | NO-GO                | All eight migrations validated on a disposable local PostgreSQL 16.14 database; production state/history, TLS and backup restore remain unverified. See `DATABASE_MIGRATION_PLAN.md`. |
| Clerk production auth          | NEEDS USER ACTION    | Code uses Clerk; dashboard instance, production keys/origins, first-login provisioning, and email verification must be confirmed. See `AUTHENTICATION_DEPLOYMENT.md`.                 |
| Nexconn production chat        | NEEDS USER ACTION    | Four server settings are required together for the current provider adapter; live credentials/account callback configuration are unknown.                                             |
| Desktop-to-Railway URL         | IMPLEMENTED LOCALLY  | Production build requires validated `BT_API_BASE_URL` and embeds it in Electron main; the real service origin remains unknown until infrastructure is approved.                       |
| Health/readiness               | IMPLEMENTED LOCALLY  | `/api/v1/health` is process liveness; `/api/v1/health/ready` performs bounded DB readiness. Live DB behavior remains unverified.                                                      |
| Production operations/security | NEEDS ENV VALIDATION | Pool bounds/timeouts, production TLS verification and bounded Prisma shutdown are implemented; replica budget, provider TLS, backups and monitoring need review.                      |

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

## Phase 3 — Database production-readiness audit

**Status: AUDIT COMPLETE; PRODUCTION DATABASE NO-GO.** Static inspection found 8 ordered
PostgreSQL migrations and 21 models / 19 enums. The committed migrations contain no table/column
drops or row deletes. Migration 6 renames/adds Decision Vault enum values, adds an owner field and
backfills it from `createdById`; migration 8 adds nullable Clerk identity and makes the legacy
password hash nullable.

The dangerous `tmp_rebaseline_decision_vault.sql` was moved from `apps/api/prisma/` to
`docs/quarantine/sql/`. The recorded SHA-256 is
`5574f219461d83b5e00218d841bd0d9f98cea0f162160666b4626b4b3761d5d8`. It drops six Decision Vault
tables and five enum types using `CASCADE`, then deletes migration 5 history. Its claim that tables
are empty is unverified. It has not been executed and has no active script/deployment reference.

Runtime and CLI share `DATABASE_URL` and a common URL/TLS resolver. Pool defaults are 5 clients per
process, 5-second connection timeout and 10-second idle timeout, with bounded validated overrides.
Production requires `DATABASE_SSL_MODE=verify-full`; optional `DATABASE_SSL_ROOT_CERT` identifies
the CA file. Shutdown drains HTTP for up to 8 seconds, closes remaining connections on timeout, and
disconnects Prisma with a 5-second bound. `/api/v1/health/ready` runs bounded `SELECT 1`; the
existing `/api/v1/health` remains liveness. A Railway private Postgres URL is compatible in
principle when services share a project/environment, but live connection, TLS, readiness, shutdown,
migration status, backup and restore were not tested. Migration-by-migration findings, first
deployment procedure, proposed (unapproved) RPO/RTO and exact blockers are in
[`DATABASE_MIGRATION_PLAN.md`](./DATABASE_MIGRATION_PLAN.md).

Phase 3.1 changed local API configuration/source and documentation only. No database was provisioned
or contacted; no migration or SQL was executed and no production infrastructure was changed.

## Phase 3.2 — Disposable PostgreSQL migration validation

**Status: VALIDATION PASSED; PRODUCTION DATABASE STILL NO-GO.** A fresh local Docker PostgreSQL
16.14 instance with loopback-only random port, dedicated database/user and tmpfs storage began with
zero public tables. All eight committed migrations applied in order; migration status showed no
pending migrations; the Prisma schema diff returned `No difference detected`. Read-only checks found
21 application tables, 19 enums, 41 foreign keys, 48 unique constraints, 90 indexes and no
migration-history anomalies. The six Decision Vault tables/five enums remained, and Clerk identity
and legacy password nullability matched the schema. The `Decision.ownerId` backfill ran against an
empty table, so populated-row backfill behavior was not exercised. The disposable container was
removed and absence verified. Exact database identity and command results are in
[`DATABASE_MIGRATION_PLAN.md`](./DATABASE_MIGRATION_PLAN.md).

This is local migration evidence only. No API integration tests, production database, Railway,
credentials or cloud services were used; production TLS, connection budget, backup/restore and live
API readiness/startup remain unverified.

## Remaining deployment work (separate authorization required)

1. Build the root `Dockerfile` on Railway (repository root as context) and verify the image there.
2. Choose the maximum API replica count and ensure pool maximum × replicas plus migration/admin
   connections stays within the actual database limit.
3. Keep the frozen-lockfile Docker install reproducible and pin the base image by digest.
4. Supply the actual production Clerk issuer, authorized parties, API Secret Key, desktop
   publishable key, and Frontend API hostname through their intended secure configuration
   channels; verify Dashboard settings and packaged Windows email/Google OAuth flows. No values
   are guessed or stored by this audit.
5. Inventory legacy accounts and decide whether to retire self-managed auth schema/code; define
   explicit user-verified linking before any schema cleanup.
6. Complete the remaining Phase 3 database go/no-go items in `DATABASE_MIGRATION_PLAN.md`, including
   backup/restore rehearsal, production identity/history verification and replica/TLS planning.
7. Create/configure Railway and a private PostgreSQL service only after user approval; configure
   secrets in Railway Variables, backups, healthcheck, and a reviewed first migration/recovery plan.
8. Deploy to Railway only in the separately authorized phase; record the generated HTTPS domain,
   then provide it to the Windows client through supported configuration without baking a temporary
   URL into the client.
9. Configure Nexconn keys/domains/webhook callback only if live chat is part of the initial release.

Phase 1 import/runtime work is documented in `RAILWAY_CONFIGURATION.md`. Phase 2's audit is
documented above; fixes, dashboard changes, and remaining deployment items are separate work
requiring their own authorization. Nothing in this plan authorizes infrastructure creation or
deployment.

# Phase 4 — Production configuration & Nexconn readiness

**Status: LOCAL HARDENING IMPLEMENTED; PRODUCTION NO-GO.** The canonical environment matrix is
[`PRODUCTION_ENVIRONMENT.md`](./PRODUCTION_ENVIRONMENT.md). The Electron main process now receives a
build-time API endpoint and production builds reject a missing, non-HTTPS, local, or non-origin URL;
the previous `https://api.buildtogether.app` fallback was not verified and has been removed. The
renderer still obtains desktop API configuration only over the typed preload bridge. API production
startup requires a supported `NODE_ENV`, a valid optional `CORS_ORIGIN` (Batch 0D-A), explicit bounded `TRUST_PROXY_HOPS`, the existing
database TLS settings, and complete Nexconn configuration when the chat provider is enabled. With no
Nexconn values, chat remains optional and fails closed with 503; a partially configured group is a
startup error to prevent silent misconfiguration.

Nexconn remains server-credentialed: the API issues user-scoped tokens after Clerk authentication and
workspace authorization; the renderer uses the public App Key and token only. The client renews a
token on a subsequent connection attempt; logout/session loss tears down the connection. The current
UI exposes a manual retry after a disconnect/suspend, not an application-level automatic retry. The
provider SDK may have its own recovery behavior, but that was not established from a live session;
verify it against the installed SDK's official docs and real account before relying on unattended
recovery. Provider webhooks check signature, timestamp skew and idempotency. Provider-specific endpoint domains are
region/account-specific; obtain them from the Nexconn owner, do not guess. See the official
[RongCloud base URL/data-center documentation](https://docs.rongcloud.io/platform-chat-api/base-url)
and [callback signature documentation](https://docs.rongcloud.cn/server-rtc-api/auth-callback).

Production Clerk, Nexconn dashboard values, callbacks, actual API URL, Railway variables, TLS, live
OAuth, provider delivery, monitoring and recovery remain unverified. Production is **NO-GO** until
the owner actions in the environment inventory and security checklist are complete.
