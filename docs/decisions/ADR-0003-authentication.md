# ADR-0003: Authentication & session architecture

- **Status:** Accepted — **partially superseded by [ADR-0006](./ADR-0006-clerk-authentication.md)**
  (authentication is now delegated to Clerk; the credential issuance/validation and in-house session
  store below are replaced, while the transport, workspace-isolation and main-process-caller
  invariants are retained and amended by ADR-0006)
- **Date:** 2026-11-03
- **Deciders:** Principal Architect
- **Related:** [ADR-0001](./ADR-0001-technology-stack.md), [ADR-0002](./ADR-0002-desktop-framework.md), [ADR-0006](./ADR-0006-clerk-authentication.md), [desktop-architecture.md](../architecture/desktop-architecture.md), [security-guidelines.md](../engineering/security-guidelines.md)

## Context

Phase 2 adds real identity: registration, login, logout, a persistent desktop session, and
workspace/team authorization. The client is **Electron** (Phase 1), so a conventional
browser-auth pattern (cookies in the renderer, tokens in `localStorage`) is **not**
automatically secure here. Constraints from the brief and skills:

- Never store tokens in `localStorage`; never expose refresh tokens to the renderer.
- Keep token handling behind the trusted main/preload boundary; use Electron secure storage.
- Use an established password KDF (Argon2id); no custom cryptography.
- Enforce workspace isolation server-side; the backend is the authority.
- Avoid unnecessary dependencies; evaluate managed providers before adopting one.

## Decision

**Self-managed authentication** in `apps/api`, backed by PostgreSQL, with the session owned
by the Electron **main process**.

- **Passwords:** Argon2id via `@node-rs/argon2` (prebuilt N-API — installs on Windows with no
  compiler). Verify with the library's constant-time compare; never store/log plaintext.
- **Sessions:** server-managed **opaque token** pairs (short-lived access ~15 min + long-lived
  refresh ~30 days), stored **only as SHA-256 hashes** in a `Session` table (raw tokens are
  returned once and never persisted). This gives immediate **server-side revocation** — the
  property JWTs alone do not — without extra token libraries.
- **Refresh-token rotation + reuse detection:** every refresh issues a new access+refresh and
  revokes the old one; the two tokens share a `familyId`. Presenting an already-rotated
  (stolen) refresh token revokes the entire family and forces re-authentication.
- **Password reset:** explicitly out of Phase 2 scope (documented limitation).
- **Transport to the API:** `Authorization: Bearer <access>` from the **main** process only.
  Because no cookie is used for auth, **CSRF is not applicable**; this is recorded so a future
  cookie-based change re-opens it.
- **Protection:** `express-rate-limit` on register/login/refresh/accept (per-IP, and login also
  keyed by normalized email) for brute-force/anti-enumeration; generic authentication errors
  ("Invalid email or password") so account existence is never disclosed.
- **Invitation delivery:** an `EmailService` provider abstraction. No real provider is
  configured, so a **development transport** returns the plaintext invite link to the
  authorized inviter (clearly labelled dev-only); production SMTP/transactional-email config
  is documented but not wired. No email is ever pretended to have been sent.
- **Desktop integration:** the **main process** is the only thing that talks to the API for
  authenticated operations. It persists the token pair encrypted via Electron `safeStorage`
  (DPAPI on Windows, Keychain on macOS) in `app.getPath('userData')`, and exposes only named,
  argument-validated IPC methods (auth / users / workspaces / members / invitations). The
  renderer receives `AuthSessionView` (identity + workspaces) and **never** sees a token.
  On 401 the main process transparently refreshes (rotating) once, else clears the session.
  `safeStorage.isEncryptionAvailable()` is checked; if unavailable (some Linux without a
  keyring) the app warns and falls back rather than silently storing plaintext — platform
  encryption is not assumed identical.

## Rationale / trade-offs

- Self-managed avoids vendor lock-in, pricing, and desktop-redirect complexity of managed
  providers while satisfying every security requirement with a small, auditable dependency set.
- Opaque hashed sessions cost one indexed lookup per authenticated request (acceptable at this
  scale) in exchange for instant revocation and rotation-theft detection.
- Proxying auth traffic through main centralizes the token and keeps the renderer a pure,
  untrusted view — the cleanest mapping of the Electron security checklist onto this feature.

## Rejected alternatives

- **Managed auth (Clerk/Auth0/Supabase/etc.)** — rejected for now: pricing, redirect/loopback
  flow complexity in Electron, and vendor coupling were not justified for a self-contained
  identity foundation; revisit only if SSO/social login becomes a product requirement (new ADR).
- **JWT access + refresh, stateless** — rejected as the primary store: revocation would still
  need a denylist table (same DB cost), so opaque hashed sessions are simpler and revocable.
- **HttpOnly cookie session consumed by the renderer** — rejected: the renderer runs on a
  custom `app://bundle` origin; cross-origin credentialed cookies there are fragile and would
  move token handling outside the trusted main boundary the brief requires.
- **`argon2` (node-gyp)** — rejected for Windows install friction; `@node-rs/argon2` ships
  prebuilt binaries.

## Consequences

- New API deps: `@node-rs/argon2`, `express-rate-limit`, `zod`, `@prisma/adapter-pg`, `pg`,
  `dotenv` (see ADR-0001 amendment). New `Session`/`User`/`Workspace`/`WorkspaceMembership`/
  `WorkspaceInvitation` tables + initial migration.
- The preload bridge grows to the named auth/workspace surface (`packages/shared/src/desktop.ts`).
- Password reset and email verification are deferred; production email transport must be
  configured before real invitations are deliverable.
