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
    auth.routes.ts users.routes.ts workspaces.routes.ts invitations.routes.ts projects.routes.ts
  controllers/ services/ repositories/
  middlewares/   # auth, workspaceScope, requireWorkspaceRole, validate, requestLog, errorHandler
  lib/           # env.ts (zod-validated), prisma.ts (adapter client singleton), logger.ts,
                 # hashing.ts (Argon2id), tokens.ts, rate-limit.ts, envelope.ts
  errors/        # AppError + domain errors
  test/          # integration harness + setup (real Docker PG)
  tests/         # *.test.ts (auth, workspaces, chat, projects, security)
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
  server-side. The **deterministic** execution-intelligence foundation ships now and works with
  zero AI present; the optional AI context layer is a **deferred seam** (fails closed, no vendor
  dependency committed) — see ADR-0005.

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

## Phase 4 surface (built — projects)

Versioned, validated, enveloped `/api/v1/workspaces/:workspaceId/projects` — the `projects.routes.ts`
router is mounted with `mergeParams` **after** `authenticate` + `requireWorkspaceRole('MEMBER')`, so
every handler already knows the caller is a verified member of the **path** workspace, and `:projectId`
reads are always scoped to it (cross-workspace id → **404**). Operations: `list` (GET `/`), `create`
(POST `/`), `get` (GET `/:projectId`), `overview` (GET `/:projectId/overview`), `update`
(PATCH `/:projectId`), `archive`/`restore` (POST `/:projectId/archive|restore`). Body validation via
`validate(...)` and query validation via a new `validateQuery(...)` middleware (`req.validatedQuery`);
the list supports scope/status filters, case-insensitive search, sort + direction, and **keyset cursor
pagination** (`meta.cursor`). `project.service.ts` enforces the **project permission matrix**
server-side (OWNER/ADMIN full; a MEMBER manages only projects they own/created; assigning a foreign
owner is OWNER/ADMIN and must be a current member; **PRIVATE** projects 404 to non-entitled readers —
existence not leaked), generates/uniquifies `projectKey`+`slug` per workspace (DB unique constraint is
the race backstop → `409`), and treats `archivedAt` as the sole archive marker. `project.repo.ts` is
the only layer touching Prisma; `lib/view.ts` maps rows to the `ProjectView` DTO. Covered by 21
integration tests in `projects.test.ts` against real PG.

## Phase 7 surface (built — deterministic execution intelligence)

Versioned, validated, enveloped `/api/v1/workspaces/:workspaceId/intelligence` — the
`intelligence.routes.ts` router is mounted with `mergeParams` **after** `authenticate` +
`requireWorkspaceRole('MEMBER')` + a dedicated `intelligenceLimiter` (`INTELLIGENCE_RATE_LIMIT` /
5 min), so the caller is a verified member of the **path** workspace before any signal is read.
Operations: `GET /projects/:projectId/{overview,health,blockers,risks,recommendations,decision-impacts}`
(personalized slices of one orchestrator pass), `GET /personal`, `POST /dismissals` and
`DELETE /dismissals`. Query validation via `validateQuery(intelligenceQuerySchema)`
(`deadlineWindowDays`, 1–90, defaults to the engine window); body validation via
`validate(create|deleteDismissalSchema)`.

`intelligence.service.ts` is the **sole orchestrator** and the only layer that reads persistence:
`intelligence.repo.ts` is the **only** Prisma layer. Authorization is **reused, not reimplemented**
— a project read is gated through `project.service.getProject` (a foreign or PRIVATE project the
caller cannot see → **404**, a non-member → **403** via the mount), and personal intelligence reuses
the already visibility-filtered `task.service.listMyTasks`. The engine itself is a set of **total,
pure functions** (`services/intelligence/{common,health,blockers,risk,recommendations,impacts,
personal}.ts`) over already-authorized signal rows plus an explicit `now` — no Prisma, no Express,
no ambient clock — so every health state, blocker, risk and next-best-action is deterministic,
explainable (WHAT/WHY/EVIDENCE/ACTION) and unit-testable. Nothing derived is stored; only
`IntelligenceDismissal` (a user's `DISMISSED`/`RESOLVED` state on a signal, unique on
`(workspaceId, userId, kind, dedupKey)`) and the `Notification` model persist (see ADR-0005). Dismiss
hides an item from **that user's** list only — health is never dismissal-filtered and never rewritten.
The `Notification` model + migration ship now; its producer/consumer wiring is deferred with the AI
seam. Conversation-derived (AI) blocker detection is out of this increment — PostgreSQL stores no
message bodies (Nexconn owns them). 13 engine unit tests + 6 HTTP integration tests cover health,
blocker/risk/recommendation detection, decision-revision impact over the real Phase 6 supersede
chain, workspace/project isolation, and dismissal dedup.

## Not yet built

After Phase 7 the API holds projects (Phase 4), tasks & dependencies (Phase 5), the Decision Vault
(Phase 6) and the deterministic execution-intelligence surface above. Still unbuilt: the optional
**AI context layer** (provider-independent seam, no vendor dependency committed — ADR-0005),
**notification** producer/consumer endpoints (the `Notification` model exists but is not yet
emitted/consumed), analytics, external integrations and payment. There is also no password reset yet
(documented limitation, ADR-0003).
