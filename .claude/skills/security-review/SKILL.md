---
name: security-review
description: "Security engineering and review for BuildTogether. Use when implementing or auditing authentication, role-based and workspace-scoped authorization, secret management, input validation, API protection, CORS, rate limiting, secure file handling, dependency vulnerability scanning, or prevention of insecure direct object references. Assumes a user must never access another workspace's private data without authorization."
---

# Security Review — BuildTogether

Core assumption: **a user must never access another workspace's private data without
authorization.** Treat isolation between workspaces as a security boundary, not a UI
convenience. Run this review on every phase that touches auth, data access, secrets,
inputs, or network surface.

## Authentication & session

- Authenticate every non-public endpoint. Attach a typed `req.auth` in middleware; never
  trust identity claimed by the client body.
- Use vetted session/JWT practices: short-lived access tokens, secure/HttpOnly/SameSite
  cookies for web sessions, server-side revocation. Passwords hashed with a strong KDF
  (argon2/bcrypt) — never stored or logged in plaintext.
- Nexconn **App Secrets** and AI provider keys live **only** server-side
  (`apps/api` env). The frontend never receives them; it gets a backend-minted,
  short-lived Nexconn token (see `nexconn-integration`).

## Authorization — workspace isolation (highest priority)

- Enforce membership on **every** workspace-scoped query: constrain by `workspaceId`
  derived from the authenticated user's memberships, not from a client-supplied id.
- Prevent **Insecure Direct Object References (IDOR)**: before returning/updating a
  resource by id, verify it belongs to an authorized workspace. A valid token must not
  grant cross-workspace reads by guessing ids.
- RBAC: roles (owner/admin/member/guest) map to allowed actions; check role at the
  service layer for mutations, not just hide buttons in the UI.

## Secrets & configuration

- No secret in source, git history, client bundle, or logs. Load from environment,
  validate presence at boot (fail closed).
- Rotate-able credentials; distinct values per environment. `.env` files are gitignored;
  only `.env.example` with placeholders is committed.
- Never print secrets in error responses or request logs; redact at the logger.

## Input validation & injection

- Validate and sanitize all input at the edge (schema in `backend-engineering`). Reject
  unknown fields on writes; clamp sizes.
- Use Prisma's parameterized API exclusively — no string-concatenated SQL. Validate
  values that flow into file paths, redirects (allow-list), and any dynamic selectors.
- Encode/refuse unsafe content rendered in the UI (stored chat/task/decision text is
  rendered safely, not as raw HTML).

## Network & API protection

- **CORS**: explicit allow-list of origins (the web app origin), credentialed where the
  session requires it; never `origin: *` with credentials.
- **Rate limiting** on auth and expensive endpoints (per user + per IP); fail closed on
  limit; guard against enumeration on login/invite endpoints.
- Security headers (HSTS, CSP, `X-Content-Type-Options`, referrer/permissions policy).
  TLS/HTTPS only in non-local environments.

## File & attachment handling

- Enforce type + size allow-lists **server-side** before accepting/handing off to Nexconn.
- Store/serve with opaque names; never trust client filenames for paths or content-type.
- Scan/quarantine policy for uploads where applicable; download links are authorized,
  time-limited, not guessable.

## Dependencies

- `pnpm audit` (and lockfile review) each phase; add no package without need
  (see `CLAUDE.md` dependency rules). Pin versions; watch for typosquatting/near-name
  packages. Review postinstall-script-bearing packages before install.

## Review checklist (report findings, do not silently fix-and-skip)

1. Every workspace-scoped read/write verifies membership → no IDOR.
2. Role checked on mutations, not only hidden in UI.
3. No secret/App Key present in `apps/web` source or bundle.
4. All external input validated; SQL only via Prisma parameterized API.
5. CORS origin allow-listed; rate limits on auth/expensive routes; security headers set.
6. Uploads type/size validated server-side, stored with opaque names.
7. `pnpm audit` reviewed; new deps justified and pinned.
8. Secrets loaded from env, validated, redacted from logs; `.env` not committed.

Any accepted risk or deferred control is documented in the phase report and the security
guidelines doc, never left implicit.
