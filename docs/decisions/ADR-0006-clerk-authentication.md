# ADR-0006: Delegate authentication to Clerk (Cue keeps authorization)

- **Status:** Accepted
- **Date:** 2026-11-06
- **Deciders:** Principal Engineer
- **Related:** [ADR-0001](./ADR-0001-technology-stack.md), [ADR-0002](./ADR-0002-desktop-framework.md), [ADR-0003](./ADR-0003-authentication.md), [ADR-0004](./ADR-0004-nexconn-communication.md), [backend-architecture.md](../architecture/backend-architecture.md), [desktop-architecture.md](../architecture/desktop-architecture.md), [security-guidelines.md](../engineering/security-guidelines.md)

## Context

ADR-0003 chose **self-managed** authentication (Argon2id passwords + opaque hashed sessions owned
by the Electron main process) for a self-contained identity foundation. ADR-0003 explicitly listed
"revisit only if SSO/social login becomes a product requirement (new ADR)". That threshold is now
met: sign-up, email verification, password reset, MFA and social login are product requirements,
and reimplementing them in-house is high-risk, non-differentiated security work.

Two constraints carry forward unchanged from ADR-0003:

- **Cue owns authorization.** Workspaces, memberships, roles/RBAC, and invitations remain
  server-side in `apps/api` and are **not** moved to Clerk. Clerk authenticates _who_ a user is;
  Cue decides _what_ they may access.
- **The Electron main process remains the sole authenticated API caller.** The renderer is a pure,
  untrusted view and never handles long-lived credentials.

## Decision

**Adopt Clerk as the authentication provider while preserving the existing authorization model and
the main-process security boundary.** This amends and partially supersedes ADR-0003: the credential
issuance/validation and session-store halves of ADR-0003 are replaced; its transport (`Bearer` from
main only), workspace isolation, and renderer-never-sees-a-token rules are retained.

### 1. Verification is the API's only trust boundary

The API no longer issues, stores, or rotates credentials. There are **no** credential endpoints
(register/login/refresh/logout/change-password are removed). The single auth route is
`GET /api/v1/auth/me`. Every authenticated request carries `Authorization: Bearer <clerk-session-token>`,
which the centralized `authenticate` middleware verifies via `lib/clerk.ts`:

- `verifyClerkSessionToken` uses Clerk's supported Backend `verifyToken` (signature, issuer,
  audience, authorized parties, expiry) and returns **only** the stable `sub` (Clerk user id) and
  `sid` (session id). JWTs are never decoded by hand and an unverified token is never trusted.
- Verification runs over **two supported paths**: a networkless PEM public key (`CLERK_JWT_KEY`,
  preferred in production) or remote JWKS via the Secret Key (`CLERK_SECRET_KEY`). Both are
  optional in dev/test so the API boots without Clerk credentials, in which case `authenticate`
  **fails closed** (401) for every request. Production boot requires at least one.
- Any verification failure (bad signature, expired, wrong issuer/audience/authorized-party) is one
  generic 401 — existence and internals are never disclosed.

### 2. Internal identity mapping (never key on email)

`User.clerkUserId` is added as a **required, unique** column and is the stable join key. On the
first verified request for an unknown `sub`, `identity.service` provisions an internal `User` by
reading the Clerk user's **verified** email + name once via the Backend API (`CLERK_SECRET_KEY`);
this is not called on subsequent requests. The column add is additive in its own migration, so
rollback is a no-op on existing rows and no data is destroyed. Email is never used as the identity key, and
accounts are never auto-linked or merged — mapping is by Clerk `sub` only. Provisioning is race-safe
(unique constraint + upsert) against concurrent first-login requests.

### 3. Authorization is preserved

`authenticate` resolves the verified Clerk identity to the internal user, then all existing
authorization continues unchanged: workspace scoping, role/RBAC checks, and invitation flows are
untouched. The Nexconn chat module (ADR-0004) keeps minting client tokens for the same verified
internal identity, so realtime auth is downstream of Clerk verification — no bypass, no regression.

### 4. Token transport: renderer → main, in-memory only

`@clerk/electron` runs the Clerk bridge (main) and the Frontend API (renderer, via `ClerkProvider`
from `@clerk/electron/react`). Sign-up / sign-in / email verification / password reset are driven
by our own Monochrome UI through the Clerk hooks (`useSignIn`, `useSignUp`) — **no** prebuilt Clerk
components and therefore **no** Clerk iframe (`frame-src 'none'` is retained).

Because main must be the sole API caller, the short-lived session token crosses the boundary
through a narrow, typed, sender-validated IPC channel rather than the renderer calling the API:

1. The renderer (under `AuthProvider`) reacts to Clerk's auth state and calls `getToken()`.
2. It pushes that token to main over `auth.syncToken` (IPC `AUTH_SYNC_TOKEN`), validated as
   `string | null` and checked against the trusted renderer origin (`assertTrustedSender`).
3. Main holds it **only in memory** (`session-store.ts`), attaches it as `Bearer` to every API call,
   and reduces the auth surface to `syncToken` + `me`. There is no on-disk credential store and no
   refresh-token rotation to manage — Clerk owns refresh.
4. A keepalive re-pushes a fresh `getToken()` on an interval (~45 s) so main's holder never serves a
   stale token; sign-out clears main's holder and then signs out Clerk. On a server 401 the token is
   simply re-synced on the next Clerk state change — no silent, unbounded retry loop.

This transient, short-lived session JWT is the **one** sanctioned exception to "the renderer never
touches a token": it is minted by Clerk in the renderer and handed to main, never persisted, and
never used by the renderer to call the API directly. ADR-0003 §"renderer receives `AuthSessionView`
and never sees a token" is amended accordingly.

### 5. Session lifecycle

Loading/signed-out/signed-in states are surfaced from Clerk's `useAuth` through `AuthProvider`;
protected data is never fetched before the token round-trips and `me()` confirms the internal
session. Restart restores the session from Clerk's storage (encrypted via Electron `safeStorage` by
`@clerk/electron/storage`). Signing out or session expiry tears down the Nexconn realtime client and
clears all cached workspace state before returning to the sign-in screen — no protected data lingers
and there is no auth redirect loop.

## Rationale / trade-offs

- Delegating authentication removes the highest-liability, least-differentiated code (password KDF,
  reset, email verification, MFA, social login) while keeping the domain authorization model — the
  exact split ADR-0003 anticipated revisiting.
- Keeping main as the sole caller preserves the audited Electron security boundary; the token stays
  in memory and short-lived, so a renderer compromise yields only a transient credential Clerk
  rotates independently.
- Networkless PEM verification avoids a per-request outbound call; the Secret Key path is retained
  because first-login provisioning needs the Backend API.

## Rejected alternatives

- **Clerk for authorization too (Orgs/Roles/permissions)** — rejected: it would fork the domain
  permission model out of the API and break workspace isolation and invitation semantics.
- **Renderer calls the API directly with the Clerk token** — rejected: breaks ADR-0003's
  main-process-only caller invariant and moves token handling outside the trusted boundary.
- **Main runs Clerk itself and passes a token to the renderer** — rejected: `@clerk/electron/react`
  hooks (sign-in/sign-up/reset UI) must live where the UI does; the renderer→main sync keeps Clerk's
  supported client model intact without a bespoke main-side auth flow.
- **Prebuilt Clerk components (iframe hosted UI)** — rejected: the Monochrome custom UI is a product
  requirement and avoids widening CSP (`frame-src`) for a Clerk CDN iframe.

## Consequences

- **Dependencies:** `@clerk/electron` (+ `/react`, `/preload`, `/storage`), `@clerk/backend`
  (`verifyToken`, `createClerkClient`) in the API; `@node-rs/argon2` and the in-house
  refresh-rotation machinery become unused for authentication.
- **API surface:** credential endpoints and the `Session` credential store are retired;
  `authenticate` verifies Clerk tokens. `User.clerkUserId` added (additive, unique, required).
- **Environment (documented, no secrets committed):** server-side `CLERK_JWT_KEY` **or**
  `CLERK_SECRET_KEY` (plus optional `CLERK_JWT_ISSUER`, `CLERK_JWT_AUDIENCE`,
  `CLERK_AUTHORIZED_PARTIES`) in `apps/api`; public `VITE_CLERK_PUBLISHABLE_KEY` in `apps/desktop`.
- **Manual Clerk Dashboard configuration (required before live use, out of code scope):** create the
  Clerk instance; enable email + password and first/last name sign-up fields; add the desktop
  `app://bundle` origin (and the web origin) to allowed origins / authorized parties; configure the
  publishable/secret keys and the JWT public key per environment. If OAuth or Captcha is later
  enabled, the flows may require relaxing `frame-src`/CSP — revisit this ADR if so.
- Packaging the desktop app against a live Clerk instance is a release-time verification step not
  performed in this phase.
