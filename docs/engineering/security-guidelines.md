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

## Desktop (Electron) hardening

The `apps/desktop` shell is a distinct attack surface; controls (traceable to the official
Electron security checklist) are enforced in the **main** process — the renderer is treated
as untrusted:

- **Process isolation:** every `BrowserWindow` sets `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- **Never expose raw IPC/Node:** the sandboxed CommonJS `preload` publishes only the named,
  typed `window.bt` methods via `contextBridge` — no `ipcRenderer`, `require`, or Node
  globals cross into the renderer.
- **Validate every IPC sender:** each `ipcMain` handler asserts
  `event.senderFrame.origin` equals the trusted renderer origin (`http://localhost:5173` in
  dev, `app://bundle` in prod) before acting; untrusted frames are rejected. All IPC inputs
  (e.g. `openExternal(url)`) are type- and scheme-checked; only `https:` opens externally.
- **Restrictive CSP:** applied via `session.webRequest.onHeadersReceived` and on custom
  protocol responses — `default-src 'self'`, `script-src 'self'`, `object-src 'none'`,
  `frame-src 'none'`, `base-uri 'self'`, `form-action 'none'`, `upgrade-insecure-requests`;
  `connect-src` limited to `'self' https:` (plus the local dev/HMR origins in development).
- **No unsafe remote content:** renderer is served from a privileged custom `app://` scheme
  (never `file://`), navigation (`will-navigate`) and new windows
  (`setWindowOpenHandler`) are denied/validated, and `setPermissionRequestHandler` denies
  all permission requests.
- **No secrets in the renderer:** the client receives only non-secret config; API credentials
  and third-party secrets stay in `apps/api`.
- **Minimal dependencies:** Electron/electron-vite/electron-builder only; kept on stable.

## Input, injection & output

- Validate/sanitize all input at the edge (zod); reject unknown fields; clamp sizes.
- Database access only via Prisma's parameterized API — no string SQL.
- Render stored chat/task/decision text safely (no raw HTML / `dangerouslySetInnerHTML`
  without sanitization). Allow-list redirects and file paths.

## Network surface

- **CORS:** explicit origin allow-list (the desktop renderer origin); never `*` with
  credentials.
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

## Phase 1 state

No auth endpoints or uploads exist yet. Phase 1 hardened the **desktop surface**: Electron
process isolation, a typed/validated IPC bridge, CSP, custom-protocol loading, navigation/
permission/window guards (see `desktop-architecture.md`). These guidelines and the skill
establish the controls that every subsequent phase must satisfy from the moment it
introduces the relevant surface.
