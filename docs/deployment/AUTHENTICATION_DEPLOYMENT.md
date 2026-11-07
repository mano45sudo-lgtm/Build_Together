# CUE Authentication Deployment — Phase 2.1 Hardening

**Status: HARDENING IMPLEMENTED; PRODUCTION NOT VERIFIED.** Phase 2.1 implements the code and
test-database safeguards below. It does not validate live Clerk configuration or production
behavior. No Clerk settings, credentials, database, or deployment were changed. Secret values
were not read or recorded. The earlier audit findings are updated by the Phase 2.1 sections.

## Scope and evidence

The findings below trace the current Electron and API paths in `apps/desktop` and `apps/api`,
including the Clerk provider, custom protocol, preload IPC, API middleware, identity service,
Prisma schema and deployment environment examples. They describe repository behavior as
inspected on 2026-11-07. Dashboard-only state and production runtime behavior remain unknown.

## Authentication architecture and request flow

1. `apps/desktop/src/App.tsx` wraps the renderer in Clerk's `ClerkProvider`, configured with
   the public `VITE_CLERK_PUBLISHABLE_KEY`. `WelcomeScreen.tsx` renders Clerk's prebuilt
   `<SignIn routing="hash">` / `<SignUp routing="hash">` controls. Clerk owns password,
   email-code verification and Google sign-in UI and state; the app switches between the
   Clerk sign-in and sign-up views.
2. Electron's main process registers `app://bundle` and serves the renderer at
   `app://bundle/index.html`. The `@clerk/electron` bridge is initialized with the same
   scheme and host. The packaged installer registers the `app` protocol. The main process
   also registers the OS protocol client; the bridge receives OAuth return URLs and persists
   Clerk auth state through its storage integration.
3. Once Clerk reports a signed-in session, `src/state/AuthProvider.tsx` obtains a short-lived
   session JWT using Clerk `getToken()`, transfers it using the named `auth.syncToken` IPC
   operation, and requests `auth.me`. It repeats sync/identity checks on a keepalive interval
   and handles retry/error states. Sign-out clears the main-process token and calls Clerk
   sign-out. On application restart, Clerk's bridge restores its persisted session; the
   provider obtains a token again and calls `/auth/me`.
4. The sandboxed preload exposes typed `window.bt` methods; it does not expose raw
   `ipcRenderer` or Node APIs. Main-process IPC checks the sending frame's trusted origin.
   `session-store.ts` holds the current Clerk JWT in main-process memory only. It is not
   persisted by Cue or returned to renderer code by an API read operation.
5. The main-process API client adds `Authorization: Bearer <Clerk session JWT>` to API
   requests. The API authentication middleware accepts the Bearer token, calls the Clerk
   verifier, and derives identity from the verified token `sub`. Client-supplied user IDs or
   email addresses are not used to authenticate the request. A 401 from `/auth/me` clears
   the local authenticated view; the request is not automatically replayed.
6. `/api/v1/auth/me` is the only current API authentication route. On the first authenticated
   request, the identity service finds/creates Cue's internal user. It returns the current
   user and database-backed workspace memberships. Workspace routes independently check
   current membership and role on the server; selecting a workspace in the UI does not grant
   authorization. New users get no workspace membership during identity provisioning.
7. Workspace creation creates its owner membership transactionally. Invitation acceptance
   assigns the invited role after server checks. The user cannot select their own role by
   changing a request's user ID.

Official Clerk references: [Electron quickstart](https://clerk.com/docs/electron/getting-started/quickstart),
[Electron SDK](https://clerk.com/docs/reference/electron/overview),
[Electron storage](https://clerk.com/docs/reference/electron/storage),
[JWT verification](https://clerk.com/docs/reference/backend/verify-token), and
[OAuth deep links](https://clerk.com/docs/guides/configure/auth-strategies/oauth-deep-links).

## Token verification assessment

`apps/api/src/lib/clerk.ts` calls the supported `@clerk/backend` `verifyToken()` and passes
`CLERK_SECRET_KEY`, optional `CLERK_JWT_KEY`, `CLERK_JWT_ISSUER`, optional
`CLERK_JWT_AUDIENCE`, and `CLERK_AUTHORIZED_PARTIES`. Production boot now requires the Secret
Key (needed for provisioning), issuer, and at least one authorized party; development remains
usable without them and the middleware continues to fail closed. The verified `sub` is the authoritative external
identity key; the DB's internal user ID is attached to the request after lookup/provisioning.
The verifier checks token signature and time validity (including expiration) through Clerk's
verification implementation. Invalid/expired tokens become unauthorized responses.

Issuer and authorized-party checks are mandatory in production; audience remains optional unless
the actual production token configuration requires it. The code does not invent issuer,
audience, or authorized-party values. Obtain the issuer from the intended production
instance/token configuration and authorized-party values from intended token `azp` claims and
registered app origins; verify those values with the Clerk configuration owner before setting
them.

The code does not fall back to trusting a client-supplied ID, email, or legacy session token.
No authentication bypass was confirmed in the inspected source. This conclusion is static
source review, not penetration-test evidence.

## Email verification and account identity

The UI delegates registration, email-code and Google OAuth flows to Clerk, so allowed methods
and whether sign-up requires verification remain controlled by the Clerk instance. The API now
selects the primary address only if its status is `verified`; otherwise it selects the first
verified address in Clerk's returned `emailAddresses` order. It normalizes the selected address
and rejects provisioning with safe `NO_VERIFIED_EMAIL` when no verified address exists,
including when there are no addresses. No unverified value is a fallback. Clerk `sub` remains
authoritative and distinct Clerk users are never merged by email.

Existing profiles refresh from Clerk at most once per process-local five-minute cache window.
Only a selected verified email and a non-empty supplied name can update Cue's row. Missing
provider name does not overwrite a useful Cue name. A unique-email collision becomes explicit
`IDENTITY_EMAIL_CLASH`; no merge occurs. Concurrent refreshes for one Clerk identity are
serialized within an API process. Replicas can briefly hold different snapshots until refresh.
Invitation inbox reads and acceptance force a fresh provider lookup; acceptance compares against
the refreshed verified email, so an old primary address cannot be used after the Clerk email
changes. If Clerk cannot provide a current verified profile, invitation operations fail closed.
The code does not change Clerk's Dashboard verification policy, which still needs manual
confirmation.

Clerk documents email verification state in its [Backend EmailAddress type](https://clerk.com/docs/reference/backend/types/backend-email-address)
and configurable sign-up methods in [sign-in/sign-up options](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options).

## First-login provisioning

`authenticate.ts` verifies the token, then the identity service looks up a user by unique
`clerkUserId`. If not found, it uses the Clerk Backend API (`users.getUser(sub)`) to retrieve
profile information and creates a Cue user. The Clerk Secret Key is needed for this server-side
Backend API call; a JWT public verification key alone does not authorize profile lookup.
`CLERK_SECRET_KEY` is also accepted by the current verifier configuration.

Provisioning is idempotent for the same Clerk ID: the unique constraint plus duplicate-key
recovery re-queries the identity and returns the winning row after a concurrent create. If
Clerk succeeds but DB creation fails, the Clerk session remains valid; a later `/auth/me` retry
repeats lookup/fetch/create. A conflicting email attached to a different Clerk ID is rejected
and is not auto-linked. This avoids unsafe email-based account takeover but requires a
user-verifiable account resolution path.

Provisioning creates only a user row, not a workspace or membership. Workspace creation and
owner membership are a later server-side transaction; invitation membership is assigned only
after invitation checks. No incorrect default workspace role is created by first login.
Existing disabled users are denied by the active-user check.

Production startup now fails early unless `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER`, and
`CLERK_AUTHORIZED_PARTIES` are configured. `CLERK_JWT_KEY` may additionally enable networkless
signature verification; audience remains optional. Errors list missing variable names only,
never values. Development remains usable without Clerk verification settings; unauthenticated
requests continue to fail closed.

## Legacy authentication inventory

| Remnant                                                                | Current status in source                                                                                                                                                     |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User.passwordHash` and Prisma `Session` model                         | Schema fields/tables remain; current Clerk auth path does not read/write sessions or password hashes.                                                                        |
| `repositories/session.repo.ts`                                         | Implements legacy hashed access/refresh sessions, rotation and revocation, but has no active route/service caller found.                                                     |
| `lib/password.ts` Argon2 hash/verify                                   | No active production auth caller found; tests still exercise helpers.                                                                                                        |
| `validation/schemas.ts` login/register/change-password/refresh schemas | Remain defined; no current API route consumes them.                                                                                                                          |
| `user.repo.ts` password lookup/update helpers                          | No active login/password route caller found. `findByEmailWithSecret` is used by invitation code and selects the hash although invitation logic does not validate a password. |
| `SESSION_SECRET`                                                       | Still required by the environment loader's production guard, but not used by the current Clerk request path.                                                                 |
| Access/refresh TTL settings                                            | Loaded/defaulted for the legacy repository; no active auth-route consumer found.                                                                                             |
| Password/session endpoints and middleware                              | Not mounted in current API routes. `GET /api/v1/auth/me` is the active auth endpoint.                                                                                        |

No legacy code, schema, or data was changed. Existing password accounts are not linked to
Clerk users automatically. Before retiring remnants in a separately approved phase, establish
whether old accounts/session rows matter, define a secure re-authentication/linking process,
and plan additive migration and rollback. Do not infer that the retained database fields are
empty.

## Environment variable inventory

| Variable                       | Consumer and purpose                                                                                                                             | Dev                                                                                                           | Production                                                                               | Where configured                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `VITE_CLERK_PUBLISHABLE_KEY`   | Desktop renderer `App.tsx`; selects the Clerk instance. Public value, embedded at build time. Use test key in dev and live key in release build. | Required                                                                                                      | Required                                                                                 | Desktop local env/build environment; production release build pipeline. Never put secret keys in Vite vars.      |
| `CLERK_SECRET_KEY`             | API Clerk backend client and verifier; profile fetch for new internal user provisioning. Secret.                                                 | Needed for first-time provisioning; development may boot without it.                                          | Required at API startup for first-login provisioning.                                    | API process environment / hosting platform secret variables.                                                     |
| `CLERK_JWT_KEY`                | API verifier's Clerk JWT public key for local cryptographic verification.                                                                        | Optional if Secret Key verifier path is used.                                                                 | Optional when Secret Key is available; configure if using local JWT-key verification.    | API process environment / hosting platform variable; public verification material, but protect config integrity. |
| `CLERK_JWT_ISSUER`             | API verifier issuer constraint. Must match actual token issuer.                                                                                  | Optional                                                                                                      | Required at API startup; obtain actual value from production Clerk configuration.        | API process environment / hosting platform variable.                                                             |
| `CLERK_JWT_AUDIENCE`           | Optional API audience constraint; only configure if tokens carry the intended audience.                                                          | Optional                                                                                                      | Optional; verify token claim first.                                                      | API process environment / hosting platform variable.                                                             |
| `CLERK_AUTHORIZED_PARTIES`     | API verifier allowed `azp` origin list.                                                                                                          | Optional                                                                                                      | Required at API startup; obtain actual allowed parties from token `azp` and app origins. | API process environment / hosting platform variable.                                                             |
| `VITE_CLERK_FRONTEND_API_HOST` | Electron build-time Frontend API hostname used to scope script/image/font and explicit socket CSP sources.                                       | Optional if host can be derived from the dev publishable key; no Clerk host is needed for Clerk-less UI work. | Required explicitly for production Electron build; no domain is guessed or derived.      | Desktop `.env.production` or release build environment; host only, no scheme.                                    |
| `SESSION_SECRET`               | API env loader's production non-default guard; no active Clerk flow use found. Legacy configuration residue.                                     | Optional/default behavior per loader                                                                          | Required by current boot guard despite no active Clerk use.                              | API process environment / hosting platform variable; never desktop.                                              |
| `BT_API_BASE_URL`              | Electron main API client target. Packaged default currently falls back to `https://api.buildtogether.app`; it is not a Clerk setting.            | Usually local API override                                                                                    | Must target the actual API deployment via supported release configuration.               | Desktop development env or release/runtime configuration; current installer excludes `.env`.                     |
| `DATABASE_URL`                 | API Prisma/Postgres connection used by identity provisioning and app data. Not Clerk-specific.                                                   | Required to provision/use API                                                                                 | Required                                                                                 | API local env or server host secret variables.                                                                   |

OAuth client credentials and allowed providers are configured in Clerk Dashboard, not as
desktop app secrets. Do not put `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`, database credentials, or
OAuth client secrets in the renderer or packaged desktop environment.

## Electron callback and Clerk instance configuration

The application uses a registered `app://bundle/` origin and Clerk Electron bridge rather
than `file://` or a localhost redirect. Clerk's documented native OAuth format is
`scheme://host/`, with the trailing slash allowlisted; the current custom scheme/host is
structurally suitable for a packaged Windows callback. Production OAuth still needs a
packaged Windows callback test. The callback URI is distinct from the Clerk Frontend API
domain: a website/custom redirect domain is not inherently required for this app callback,
but Clerk's production instance requires a configured production domain/Frontend API host.
Use production Clerk OAuth provider credentials, not shared development credentials.

Clerk's Electron guide requires Native API and allowed renderer origin configuration. For this
app, intended entries are the actual dev renderer origin and `app://bundle` plus the native
OAuth redirect `app://bundle/`. Exact live dashboard state was not checked; verify allowed
origins, redirect allowlist, email verification policy, Google enabled for sign-in and sign-up,
production instance/key pairing, production domain, and provider credentials before release.
The Electron Vite config now reads the host-only `VITE_CLERK_FRONTEND_API_HOST` from the
production build environment and validates it before embedding the exact host in CSP. Production
builds fail if it is missing or malformed; the host must be supplied by the Clerk configuration
owner. Development derives the host from the public publishable key when available. CSP does not
add Clerk-wide wildcard sources or unsafe script policies. Existing broad HTTPS/WSS `connect-src`
for other app integrations was retained; narrowing those origins requires a separately validated
endpoint inventory to avoid breaking non-auth traffic.

Clerk notes Native API changes browser CAPTCHA protections. Decide and verify suitable
anti-abuse controls/rate limits for desktop sign-up. Clerk Electron SDK is documented as beta;
pin/review the selected SDK version and exercise the production packaging flow.

Official references: [Electron production deployment](https://clerk.com/docs/guides/development/deployment/electron),
[Clerk production deployment](https://clerk.com/docs/guides/development/deployment/production),
[OAuth deep links](https://clerk.com/docs/guides/configure/auth-strategies/oauth-deep-links).

## Prioritized findings and required tests

No confirmed critical authentication bypass or account takeover was found in the inspected
source. Static review does not establish production safety. Items below are prioritized by
potential impact, then reliability and cleanup.

| Priority                                            | Evidence and impact                                                                                                                                                                                 | Recommended fix                                                                                                                                 | Required tests                                                                                                                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High — verified email not enforced                  | **Implemented:** primary verified address wins; otherwise first verified address is selected. No verified address rejects provisioning. Invitation reads/acceptance force a fresh verified profile. | Still confirm Clerk Dashboard email policy; code fails closed independent of that setting.                                                      | Unit cases cover verified primary, unverified primary/verified secondary, no addresses, and no verified address. Integration invite tests remain blocked pending isolated DB. |
| High — optional issuer/party restrictions           | **Implemented:** production env validation requires issuer and authorized parties; verifier receives those configured constraints.                                                                  | Supply actual production values from Clerk owner and exercise them against the production instance before release.                              | Unit tests cover success and SDK rejection mapping for invalid/expired/wrong-issuer/wrong-party cases. Live signed-token tests remain.                                        |
| Medium — provisioning config can fail after startup | **Implemented:** production boot requires `CLERK_SECRET_KEY`; missing config fails with variable names only.                                                                                        | Configure the key in the API host secret store; no key value was handled in this work.                                                          | Env validation tests cover missing settings and valid config. No production startup was run.                                                                                  |
| Medium — profile email can become stale             | **Implemented:** 5-minute process-local refresh, non-empty name updates only, collision rejection, and forced fresh invite checks.                                                                  | Multi-replica copies can remain stale until refresh; verify behavior under production topology.                                                 | Unit tests cover email/name changes, collision, forced invite refresh and concurrent same-process refresh. DB-backed invite tests remain.                                     |
| Medium — production Electron host/CSP unverified    | **Implemented:** exact Frontend API hostname is validated and used for Clerk CSP; production desktop build requires explicit host.                                                                  | Clerk owner must supply `VITE_CLERK_FRONTEND_API_HOST`; live packaged CSP behavior is not verified.                                             | Host-format, dev derivation and exact CSP-source unit tests pass. Production desktop build/runtime test remains.                                                              |
| Medium — Native API anti-abuse                      | Clerk's Electron setup changes browser CAPTCHA behavior; source review did not establish provider-side abuse controls.                                                                              | Confirm Clerk-side controls and API rate limiting are adequate for production desktop onboarding.                                               | Repeated signup/OTP abuse, rate-limit behavior across replicas, provider limits and recovery.                                                                                 |
| Medium — production behavior unverified             | No live dashboard, email delivery, Google provider, packaged first login, restart or production token test was performed.                                                                           | Complete staged end-to-end verification in a production-like Clerk instance and packaged signed Windows build before release.                   | Checklist below, including fresh account, existing account, alternate Google account, restart, sign-out and expired session.                                                  |
| Low — legacy auth residue                           | Unused session/password functions, columns, TTLs and boot-only `SESSION_SECRET` remain. Dead code confuses the security boundary and config requirements.                                           | In a separately authorized cleanup/data phase, inventory legacy records, define account linking, then retire code/schema in a staged migration. | Static caller audit; legacy account/session inventory on an approved non-production copy; migration/rollback tests.                                                           |
| Low — email-bearing repository lookup               | Invitation path calls `findByEmailWithSecret`, which also selects `passwordHash`, though no password check is active there.                                                                         | Use a narrow email lookup for invitation identity.                                                                                              | Repository selection test and invitation regression tests.                                                                                                                    |

## Production verification sequence from the Phase 2 audit

The implementation-status section at the end of this document supersedes recommendations in
this original audit checklist.

1. Configure a separate Clerk production instance, domain, live publishable/secret keys and
   production OAuth credentials; enable Native API and exact allowed origins/redirects.
2. Agree and enforce verified-email selection and legacy account linking behavior.
3. Require intended issuer and authorized-party validation; confirm whether an audience claim
   is used. Ensure first-login provisioning has its required backend credential.
4. Align the packaged Electron CSP with the actual Clerk production Frontend API host and keep
   API/Clerk secrets server-side.
5. Run unit and API integration tests for token verification, identity provisioning, invitation
   matching, workspace authorization and failure/retry cases.
6. Test a packaged Windows build: email/password, email-code, Google for new and existing
   accounts, callback, first API call, restart restoration, expired token, sign-out and denied
   workspace access. Confirm no `Origin` + `Authorization` header conflict in browser/native
   requests; use the Clerk Electron SDK request path.
7. Review logs for token/secret/PII leakage and verify support/recovery flows before real users.

## Not performed

No Clerk Dashboard access or settings change; no credentials were read, printed, rotated or
created; no production database access or migration; no live email/Google OAuth; no packaged
production auth test; no production deployment or commit. The exact live issuer,
audience, authorized parties, provider setup, allowed origins and production FAPI domain remain
to be verified by an authorized configuration owner.

## Phase 2.1 implementation status (supersedes earlier recommendations above)

- Verified-email selection and profile synchronization are implemented as described above. The
  primary address is preferred only when verified; otherwise the first verified address is used.
  Invitation inbox and acceptance paths force a fresh profile read.
- Production API configuration now requires `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER`, and
  `CLERK_AUTHORIZED_PARTIES`. The configuration owner must provide issuer from the intended
  production instance/token configuration and authorized parties from actual intended token
  `azp` claims and registered app origins. Audience remains conditional on intended token setup.
- The Electron Vite build consumes `VITE_CLERK_FRONTEND_API_HOST` and scopes the Clerk-related
  CSP host sources to that validated hostname. Production builds require this value explicitly;
  the Clerk owner must obtain it from the production instance's Domains/Frontend API settings.
  Development can derive the exact host from a public publishable key. The broad HTTPS/WSS
  `connect-src` needed by existing app integrations was retained and was not expanded by this
  change.
- Integration tests now require a separate loopback PostgreSQL URL in `TEST_DATABASE_URL`,
  whose database name contains an isolated `test` marker. Before cleanup, `resetDb()` checks
  `NODE_ENV=test` and verifies `current_database()` exactly matches that configured name.
  No database was created, connected to, or reset in this phase.
- Checks run: API unit tests 5 files / 31 tests passed; desktop tests 9 files / 50 tests passed;
  shared/API/desktop typechecks passed; API production TypeScript build passed; workspace lint
  passed; Electron development-mode build passed. API integration tests were not run because `TEST_DATABASE_URL` was unset and no
  isolated test database was confirmed. Production desktop build/runtime, Clerk Dashboard,
  live JWT/email/Google OAuth, and packaged Windows callback were not tested.
- No Clerk Dashboard settings, credentials, production database, migration, Nexconn integration,
  Railway resource, deployment, commit, or push was touched. Legacy auth schema/data/helpers
  remain in place.
