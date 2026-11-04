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
  check role (owner/admin/member) at the service layer **and** route for mutations — not only
  hidden in the UI. Prevent IDOR: verify resource ownership before returning/mutating by id.
- Sessions/tokens (ADR-0003): server-managed **opaque** token pairs — short-lived access
  (~15 min) + rotating refresh (~30 days) — stored **only as SHA-256 hashes** with immediate
  server-side revocation and family-based reuse detection. **No** auth cookie (so CSRF is not
  applicable); the Electron **main** process sends `Authorization: Bearer` and never exposes a
  token to the renderer. Passwords hashed with **Argon2id** (`@node-rs/argon2`); never
  plaintext or logged.

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
- **No secrets in the renderer:** the client receives only non-secret config and an
  `AuthSessionView` (identity + workspaces) — never a token. The session token pair is held by
  **main**, encrypted at rest via `safeStorage` (DPAPI/Keychain), falling back to memory-only
  with a warning when platform encryption is unavailable (never plaintext on disk). API
  credentials and third-party secrets stay in `apps/api`.
- **IPC argument validation:** beyond sender-origin checks, every handler validates its
  arguments (types, string shapes, allowed role values) before use; OWNER is rejected as an
  assignable IPC role (ownership moves only through the dedicated transfer op).
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

## Phase 2 state (identity & teams — implemented)

Phase 2 introduced the real auth/authz surface this document governs: Argon2id password
hashing; opaque hashed sessions with rotation + family reuse detection and server-side
revocation; workspace isolation enforced by `workspaceScope` + `requireWorkspaceRole`
(server-derived, never client-supplied); role invariants (a workspace always has an owner;
owner leaves only via transfer; no self-escalation). Secure invitations: random tokens stored
only as hashes, expiring, single-use, and bound to the invited email + role — a token cannot
grant a higher role or admit a different email. `express-rate-limit` throttles
register/login/refresh/accept (per-IP and login per normalized email) with generic auth errors
for anti-enumeration. Desktop session ownership and `safeStorage` handling are as above.

**Accepted, documented risks (not defects):** no password reset / email verification yet
(ADR-0003); invitation email uses a clearly-labelled dev transport until a real provider is
configured; production email/SMTP config is required before invitations are genuinely
deliverable.

## Phase 4 state (projects — implemented)

Projects add a resource layer **inside** the existing workspace boundary — they do not weaken it.

- **Authorization is server-derived, never client-asserted.** The projects router is mounted after
  `authenticate` + `requireWorkspaceRole('MEMBER')` with `mergeParams`, so a caller can only ever reach
  projects of a workspace they are verified to belong to; a **cross-workspace `projectId` returns 404**
  (no IDOR, no existence leak). The renderer’s `lib/rbac.ts` only hides controls — it is **never** the
  security boundary.
- **Project permission matrix enforced in the service:** workspace OWNER/ADMIN manage every project; a
  MEMBER views workspace-visible projects, creates, and manages (update/archive/restore/change-owner)
  **only the projects they own or created** — every mutation re-derives rights from the DB.
  Assigning/reassigning a project owner to another user is an OWNER/ADMIN action and the target must be
  a **current workspace member** (else `OWNER_NOT_MEMBER`); a project always retains exactly one owner.
- **Visibility boundary:** a `PRIVATE` project is readable only by its owner/creator and workspace
  OWNER/ADMIN; a non-entitled read (and list exclusion) returns **404**, so private-project existence is
  not disclosed across the visibility boundary.
- **Input & integrity:** Zod validates body (`validate`) and query (`validateQuery`); `projectKey`/`slug`
  are generated and uniquified **per workspace** with a DB unique-constraint backstop (race → 409); all
  ids interpolated into SQL-free Prisma queries; `ownerId`/`createdById` are `Restrict` FKs so audit
  pointers can’t dangle. IPC inputs for projects are sender- and argument-validated (`reqId` shapes the
  path ids; query/payload allowlisted in main), and **no token or secret crosses into the renderer**.

No new secrets or external surface were introduced; the Nexconn App Secret remains server-side only.
