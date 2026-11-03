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
  routes/v1/     # versioned routers
  controllers/ services/ repositories/
  middlewares/   # auth, workspaceScope, validate, requestLog, errorHandler
  lib/           # env.ts (zod-validated), prisma.ts (client singleton), logger.ts
  errors/        # AppError + domain errors
  types/
prisma/          # schema.prisma + migrations (added in the DB phase)
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

- **Nexconn:** backend performs privileged operations and mints short-lived, user-scoped
  tokens for the client SDK (see `nexconn-integration.md`). No App Secret leaves the server.
- **AI:** behind a provider-independent service interface in `services/ai`; provider keys
  server-side; implemented in a later phase.

## Not yet built

Phase 0 provides a compiling Express skeleton (`app.ts` + `index.ts` with a health route)
and configuration only — no product endpoints. Feature endpoints arrive in later phases.
