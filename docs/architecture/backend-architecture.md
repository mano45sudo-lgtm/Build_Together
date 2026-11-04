# Backend Architecture (`apps/api`)

Node.js + Express + TypeScript. Governed by the `backend-engineering` skill (structure),
`database-engineering` (data), `security-review` (authz/secrets). This is the only layer
that holds credentials.

## Request pipeline

```
request
  → requestLog (assign requestId)
  → auth            (verify session/token → req.auth)
  → workspaceScope  (resolve + verify membership → req.workspace)
  → validate(schema)(body/query/params typed & sanitized)
  → controller      (thin: call service, map to envelope)
  → service         (business logic, transactions; no req/res, no Prisma)
  → repository      (only layer touching Prisma)
  ← standardized { data, error, meta } envelope
  → errorHandler    (last middleware; maps AppError → safe response)
```

## Layout

```
apps/api/src/
  index.ts       # load+validate env, build app, listen
  app.ts         # express app factory (no listen → testable)
  routes/        # v1.ts mounts the versioned routers
    auth.routes.ts users.routes.ts workspaces.routes.ts invitations.routes.ts
  controllers/ services/ repositories/
  middlewares/   # auth, workspaceScope, requireWorkspaceRole, validate, requestLog, errorHandler
  lib/           # env.ts (zod-validated), prisma.ts (adapter client singleton), logger.ts,
                 # hashing.ts (Argon2id), tokens.ts, rate-limit.ts, envelope.ts
  errors/        # AppError + domain errors
  test/          # integration harness + setup (real Docker PG)
  tests/         # *.test.ts (auth, workspaces, security)
prisma/          # schema.prisma + migrations
```

## Conventions

- **Versioning:** all routes under `/api/v1`. Breaking changes → new version.
- **Envelope:** `{ data, error, meta }` on every response; `meta.requestId` for tracing.
- **Validation:** zod schemas at the edge; unknown fields rejected on writes; sizes clamped.
- **Errors:** services throw typed `AppError{statusCode,code,message}`; a single
  `errorHandler` translates them; stack/SQL/secrets never reach the client.
- **Config:** `lib/env.ts` validates `process.env` once and fails fast; no scattered
  `process.env` reads; secrets redacted from logs.
- **AuthN/Z:** authenticate in middleware; authorize against workspace membership + role on
  every query (see `security-guidelines.md`). Never trust a client-supplied workspace id.

## Integration seams

- **Desktop client:** the `apps/desktop` renderer is the untrusted Electron web UI and does
  **not** call this API directly. The trusted **main** process is the sole authenticated
  client: it attaches `Authorization: Bearer <access>` from its `safeStorage`-held session,
  transparently refreshes once on 401, and forwards only named, argument-validated IPC results
  (the `{ data, error, meta }` envelope, stripped of tokens) to the renderer. The API still
  treats every request as untrusted: authenticate/authorize server-side, never trust a
  client-supplied workspace id, and set CORS to the desktop origin allow-list. Credentials and
  product secrets stay here; the main process holds only the current session's tokens.
- **Nexconn:** backend performs privileged operations and mints short-lived, user-scoped
  tokens for the client SDK (see `nexconn-integration.md`). No App Secret leaves the server.
- **AI:** behind a provider-independent service interface in `services/ai`; provider keys
  server-side; implemented in a later phase.

## Phase 2 surface (built)

Versioned, validated, enveloped `/api/v1` endpoints — each with zod validation at the edge,
authentication, workspace-scoped authorization, and integration tests against real PG:

- **Auth** (`auth.routes.ts`): `register`, `login`, `refresh` (rotation + reuse detection),
  `logout`, `me`, `change-password`. Argon2id hashing; opaque hashed session pairs; throttled
  by `makeAuthLimiter`; generic auth errors (no account enumeration).
- **Users** (`users.routes.ts`): `PATCH /me` profile update (name/avatar).
- **Workspaces** (`workspaces.routes.ts`): list/create/get/update scoped workspace ops; the
  `workspaceScope` middleware resolves the workspace **and** the caller's membership/role from
  the DB — a client-supplied `workspaceId` is never trusted. Members sub-routes are guarded by
  `requireWorkspaceRole(role)`; role changes, removal and ownership **transfer** are authorized
  server-side (a MEMBER may leave but only OWNER/ADMIN remove others; OWNER is never removed).
- **Invitations** (`invitations.routes.ts`): create/list/revoke (ADMIN+), `accept`, and
  `pending-for-me`. Tokens are random, stored only as hashes, expiring, single-use, and bound
  to the target email + role; delivery runs through the `EmailService` provider abstraction.

## Not yet built

Messaging, projects/tasks, decisions, AI, analytics, external integrations and payment all
remain unbuilt (Phase 3+); the API holds none of their routes or tables. There is no password
reset yet (documented limitation, ADR-0003).
