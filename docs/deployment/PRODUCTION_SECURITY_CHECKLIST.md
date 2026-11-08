# CUE Production Security Checklist

## Phase 2.1 implementation status

Phase 2.1 code hardening and unit checks are implemented. Production authentication is still
**not verified**. No live Clerk settings, production credentials, or database were accessed. See
[`AUTHENTICATION_DEPLOYMENT.md`](./AUTHENTICATION_DEPLOYMENT.md) for the code trace and detailed
risks. Unit/source verification is not a penetration test.

| Control                                | Finding                                                                                                                                                          | Status / evidence needed                                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Clerk session JWT signature and expiry | API uses Clerk `verifyToken()` and derives identity from verified `sub`; signature/time validation is delegated to the official SDK.                             | Source verified; negative/positive token tests and production-key config still required.                            |
| Issuer and authorized party            | Production env guard now requires issuer and authorized parties; both are passed to Clerk SDK verification.                                                      | Code enforced; actual values must be supplied by Clerk owner and tested against live instance tokens.               |
| Audience                               | Optional and passed only if set.                                                                                                                                 | Inspect actual intended token claims; configure and test only if applicable.                                        |
| Identity source                        | Client IDs/emails are not the auth identity; verified Clerk `sub` maps to unique `clerkUserId`.                                                                  | Source reviewed; test altered client identity fields and duplicate identity races.                                  |
| Email verification                     | Verified primary is preferred, else first verified address in Clerk response order. No verified email rejects provisioning.                                      | Implemented and unit-tested; confirm Dashboard policy and real email/Google flows before release.                   |
| First-login provisioning               | Backend API lookup requires `CLERK_SECRET_KEY`; production guard now requires it. Unique Clerk ID handles duplicate provisioning races; email clash is rejected. | Code enforced; DB integration retry/race tests await confirmed isolated local test DB.                              |
| Workspace membership and role          | Workspace routes resolve membership and role from DB; identity provisioning creates no membership.                                                               | Source reviewed; full unauthorized-role and cross-workspace integration tests remain.                               |
| Electron token storage                 | Clerk bridge persists auth state; Cue stores active short-lived API JWT in main-process memory and uses typed sender-checked IPC.                                | Source reviewed; inspect packaged release and exercise restart/sign-out/expiry.                                     |
| Legacy auth coexistence                | Password/session schema/repository/helpers remain but current auth routes do not use them. `SESSION_SECRET` remains a production boot requirement.               | Decide legacy account disposition before cleanup; no deletion performed.                                            |
| Clerk dashboard and OAuth              | Native API, production instance, domain, origin/redirect allowlists, Google production credentials and email policy were not inspected.                          | **Needs authorized dashboard verification.**                                                                        |
| Production Electron CSP                | Example Frontend API host variable is not consumed; policy has fixed Clerk host entries.                                                                         | Verify actual production Frontend API host and apply least-privilege CSP in a future approved implementation phase. |
| Native API abuse controls              | Clerk Electron Native API has different CAPTCHA protection; no live abuse control assessment.                                                                    | Confirm limits/provider protections; test OTP/sign-up abuse and multi-replica limits.                               |
| API secrets                            | Clerk Secret Key and database credentials are API-side; never place them in Vite renderer variables.                                                             | Review deployment variable store and packaged bundle without printing values.                                       |
| API CORS / proxy / rate limits         | Prior Phase 0 audit found exact-origin CORS behavior, one-hop `trust proxy`, process-local rate limits.                                                          | Confirm proxy chain and single/multi-replica exposure before relying on IP throttling.                              |
| Logs and PII                           | Request logger excludes Authorization/body; error logger and dev invitation transport still need review for raw provider/DB text and email PII.                  | Redaction review and tests required.                                                                                |
| Transport and data operations          | Production DB, backup/restore and migration safety were not tested.                                                                                              | Private DB networking, TLS, backup restore rehearsal and reviewed migration plan required.                          |
| Release integrity                      | Windows installer is unsigned per prior packaging log.                                                                                                           | Plan trusted signing and verify downloaded artifact integrity before distribution.                                  |

**Phase 2.1 update:** The earlier Production Electron CSP row is superseded: the build now
requires validated `VITE_CLERK_FRONTEND_API_HOST` in production and embeds its exact hostname
in Clerk CSP sources. The live host remains a Clerk-owner input and packaged behavior is untested.

## Required before production user access

- [ ] Use one dedicated Clerk production instance for desktop publishable key and API verifier/backend key.
- [ ] Configure the production Clerk domain/Frontend API host and production Google OAuth credentials.
- [ ] Enable Native API; allow the exact dev origin(s) as appropriate and packaged `app://bundle` origin; allow `app://bundle/` native callback.
- [x] Enforce verified-email provisioning; primary verified address wins, else first verified address. Invitation inbox and acceptance force a fresh verified profile.
- [ ] Set `CLERK_SECRET_KEY` for new-user Backend API provisioning. If verifying with `CLERK_JWT_KEY`, configure it without exposing it to the desktop.
- [ ] Supply actual production issuer and authorized-party values, then test those constraints. Set audience only if confirmed for the intended token.
- [ ] Confirm production `VITE_CLERK_PUBLISHABLE_KEY` pairs with that instance. Never ship secret keys in the desktop build.
- [ ] Set `VITE_CLERK_FRONTEND_API_HOST` from the production Clerk instance; the build validates it and scopes Clerk CSP host sources to it.
- [ ] Test fresh and existing users via email/password, email-code, Google new account and Google existing account; include email verification and callback edge cases.
- [ ] Test expired/invalid/wrong-instance tokens, restart restoration, sign-out, provisioning retry after DB failure, email collision, disabled user, unauthorized workspace role and cross-workspace access.
- [ ] Confirm Native API anti-abuse/rate limits for OTP and registration.
- [ ] Verify API proxy trust, rate limits across replicas, security headers, error logging/PII redaction, TLS, database backups and restore.
- [ ] Decide how retained legacy password accounts are safely verified/linked before retiring schema or code; never merge by email alone.
- [ ] Use a signed Windows package and verify the packaged application callback and update/distribution integrity.

Secret values were not inspected or printed. Dashboard, production database, migration, and
deployment actions remain outside this audit.

## Phase 3.2 disposable PostgreSQL validation

**Local migration validation passed; production database remains NO-GO.** A fresh PostgreSQL 16.14
Docker container with unique database/user, random loopback-only port and tmpfs storage began empty.
All eight migrations applied; `_prisma_migrations` recorded exactly the expected eight successful
entries; `prisma migrate status` reported up to date; Prisma schema diff was empty. Integrity checks
found 21 application tables, 19 enums, 41 FKs, 48 unique constraints and 90 indexes, with no
migration anomalies. All six Decision Vault tables and five enums remained. `User.clerkUserId` and
`User.passwordHash` were nullable; `Decision.ownerId` was required and `Decision.category` defaulted
to `GENERAL`. The disposable instance was removed and its absence verified. See
[`DATABASE_MIGRATION_PLAN.md`](./DATABASE_MIGRATION_PLAN.md) for the identity, migration names,
commands, limitations and cleanup records.

This does not verify populated-row backfill behavior: the database was empty when migration 6 set
`Decision.ownerId` non-null. No API integration tests, production database, Railway connection,
backup/restore, live TLS or production readiness test was run. Production remains **NO-GO**.

## Phase 3.1 database deployment remediation

Local API changes are implemented; production database remains **NO-GO**. No DB was provisioned,
contacted, migrated, reset, or modified. No SQL was executed.

| Control        | Phase 3.1 implementation                                                                                                           | Remaining evidence                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Loose SQL      | Moved to `docs/quarantine/sql/tmp_rebaseline_decision_vault.sql`; SHA-256 recorded in quarantine README. Outside Prisma tree.      | Keep quarantined and never execute; no active script/deploy reference.                             |
| Readiness      | `/api/v1/health/ready` runs bounded `SELECT 1`, returns sanitized 503; `/api/v1/health` remains liveness.                          | Unit tests and a safe disposable-DB check; configure Railway healthcheck only after DB validation. |
| Shutdown       | One idempotent SIGINT/SIGTERM path drains HTTP (8s), closes remaining connections on deadline, then disconnects Prisma (5s bound). | Verify within actual platform termination window.                                                  |
| Pool           | Defaults max 5/process, connect timeout 5s, idle timeout 10s; range-validated env overrides.                                       | Choose replica cap and confirm aggregate connection budget with provider limit.                    |
| TLS            | Production requires `verify-full`; optional CA file; no disabled certificate verification. CLI/runtime share URL resolver.         | Verify target Railway URL, server certificate/hostname and CA requirements without exposing URL.   |
| Test DB safety | Existing `TEST_DATABASE_URL` guard remains unchanged; no DB connection or test cleanup performed.                                  | Confirm a separate disposable local DB identity before integration/migration validation.           |

### Phase 3 database production-readiness audit

**Database release status: NO-GO.** Static source review only; no database was contacted or
changed, no migration status/deploy was run, and the loose SQL was not executed.

| Control                    | Finding                                                                                                                                                                                              | Status / required evidence                                                                                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration inventory        | Eight ordered PostgreSQL migrations; committed SQL has no table/column drops or row deletes. Migration 6 includes Decision Vault enum changes and a populated-row owner backfill.                    | Static audit complete; live schema/history comparison required.                                                                                                                                                                             |
| Loose SQL safety           | `tmp_rebaseline_decision_vault.sql` drops six Decision Vault tables and five enum types with `CASCADE`, then deletes migration 5's `_prisma_migrations` record. It is now quarantined with checksum. | **BLOCKED:** do not execute; do not restore to Prisma tree.                                                                                                                                                                                 |
| Existing database state    | No production target or migration history inspected.                                                                                                                                                 | Must prove empty target, or backup/restore an existing target to isolated staging and reconcile exact history/schema first.                                                                                                                 |
| Migration execution        | Prisma ORM 7 migration SQL files do not contain whole-file transaction wrappers; an interrupted migration can be partially applied. No rollback SQL is provided.                                     | Serialize one pre-deploy job; stop on failure; inspect state on isolated restore; never edit migration history or blindly retry.                                                                                                            |
| Runtime connection/pooling | `DATABASE_URL` shared by CLI/runtime; pool max 5/process by default with bounded explicit overrides.                                                                                                 | Set replica ceiling and confirm aggregate connection budget; separate a direct CLI URL if a transaction pooler is introduced.                                                                                                               |
| TLS/private networking     | Production config requires `verify-full`; optional CA file. Actual Railway URL/server TLS behavior remains unknown.                                                                                  | Use same-environment private DB reference; verify certificate and hostname without exposing credentials.                                                                                                                                    |
| Startup/shutdown           | `/api/v1/health/ready` probes DB with bounded query; process liveness stays `/api/v1/health`; shutdown drains HTTP then disconnects Prisma.                                                          | Unit tests plus safe disposable DB and platform lifecycle verification required.                                                                                                                                                            |
| Backups and restore        | No provider settings, retention, restore point, or restore rehearsal verified.                                                                                                                       | Approve RPO/RTO; verify automated backup/PITR; restore to isolated target and test monthly/before high-risk migration. Proposed starting RPO ≤15 min, RTO ≤4 hours, daily backups retained 30 days + monthly copies 3 months; not approved. |

Full SQL-level migration inventory, fresh-vs-existing target procedure, failure recovery and backup
proposal are in [`DATABASE_MIGRATION_PLAN.md`](./DATABASE_MIGRATION_PLAN.md). The database remains
NO-GO until the listed implementation and environment evidence is complete.

## Phase 2.1 checks

- API unit: 5 files, 31 tests passed.
- Desktop: 9 files, 50 tests passed.
- Shared, API and desktop typechecks; API production TypeScript build; workspace lint: passed.
- Electron development-mode build passed; production desktop build was not attempted because
  the actual production Clerk Frontend API host was not configured.
- API integration tests were intentionally not run: `TEST_DATABASE_URL` was unset and no
  isolated local test database was confirmed. Integration setup refuses an implicit development
  database and verifies `current_database()` before cleanup. No database was connected to or reset.
- Production desktop build, live Clerk configuration, packaged OAuth, live JWT verification,
  email delivery and production database behavior remain unverified.

# Phase 4 production security addendum

- [ ] API CORS is set to the exact public HTTPS browser origin; it is not `*`.
- [ ] `TRUST_PROXY_HOPS` matches the deployed proxy chain (never copy a guessed count).
- [ ] If deploying multiple API replicas, review shared rate limiting: current counters are
      process-local and do not aggregate across replicas.
- [ ] `DATABASE_SSL_MODE=verify-full`; pool maximum times replica count stays within the database budget.
- [ ] Clerk production instance, secret/publishable key pairing, issuer, authorized parties, Native API,
      allowed origins, Google OAuth and CAPTCHA/abuse controls have been reviewed by the owner.
- [ ] Packaged Windows build receives the verified API HTTPS origin via `BT_API_BASE_URL`; there is no
      baked-in default API domain or `.env` dependency.
- [ ] Nexconn app key/secret and both region-appropriate endpoints are configured together only when
      production chat is enabled. Callback URL, signature contract, replay window and test delivery are
      confirmed in the provider account.
- [ ] Error logs contain request ID and safe error class only; review platform log access/retention.
- [ ] Backups and isolated restore rehearsal meet the proposed objectives in
      [`DATABASE_MIGRATION_PLAN.md`](./DATABASE_MIGRATION_PLAN.md).

This checklist is not a production approval. None of the unchecked owner/dashboard/infrastructure
items were exercised or configured during Phase 4.
