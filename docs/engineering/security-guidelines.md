# Security Guidelines

Governed by the `security-review` skill. The controlling assumption: **a user must never
access another workspace's private data without authorization.** Workspace isolation is a
security boundary, not a UI nicety.

## Threat model (collaboration product)

Multi-tenant teams, chat-driven data, external real-time provider, server-side AI, file
attachments. Prime risks: cross-workspace data leakage (IDOR), privilege escalation, secret
exposure (Nexconn App Secret / AI keys), injection, unvalidated uploads, session/token abuse,
dependency vulnerabilities.

## Identity, authn, authz

- AuthN every non-public endpoint; derive identity server-side; never trust client-claimed
  identity or workspace membership.
- AuthZ on **every** scoped read/write: constrain by `workspaceId` from verified membership;
  check role (owner/admin/member/guest) at the service layer for mutations — not only hidden
  in the UI. Prevent IDOR: verify resource ownership before returning/mutating by id.
- Sessions/tokens: short-lived access tokens; secure/HttpOnly/SameSite cookies; server-side
  revocation. Passwords hashed with argon2/bcrypt; never plaintext or logged.

## Secrets & configuration

- Nexconn **App Secret** and AI provider keys live only in `apps/api` env. The browser gets a
  backend-minted, short-lived Nexconn token — never a secret.
- No secret in source/git/bundle/logs. Load + validate env at boot (fail closed). Redact at
  the logger. Only `.env.example` placeholders are committed; `.gitignore` blocks `.env*`.

## Input, injection & output

- Validate/sanitize all input at the edge (zod); reject unknown fields; clamp sizes.
- Database access only via Prisma's parameterized API — no string SQL.
- Render stored chat/task/decision text safely (no raw HTML / `dangerouslySetInnerHTML`
  without sanitization). Allow-list redirects and file paths.

## Network surface

- **CORS:** explicit origin allow-list (the web app origin); never `*` with credentials.
- **Rate limiting** on auth + expensive endpoints (per user + per IP); anti-enumeration on
  login/invite. Security headers: CSP, HSTS, `X-Content-Type-Options`, referrer/permissions
  policy. HTTPS-only outside local.
- Webhooks from Nexconn: verify signatures with server secrets; reject unsigned.

## Files & attachments

- Enforce type + size allow-lists **server-side** before Nexconn handoff; opaque storage
  names; never trust client filenames/content-type; authorized, time-limited, non-guessable
  download links.

## Dependencies & supply chain

- `pnpm audit` each phase; pin stable versions; no deprecated/pre-release packages; justify
  every new dependency; review packages with install-time scripts; watch typosquatting.

## Review cadence

Run the `security-review` checklist at the end of every phase touching auth, data access,
secrets, inputs, or network. Findings and any accepted risk are recorded here / in the phase
report — never left implicit.

## Phase 0 state

No auth endpoints or uploads exist yet. These guidelines and the skill establish the controls
that every subsequent phase must satisfy from the moment it introduces the relevant surface.
