---
name: backend-engineering
description: "Backend architecture and API engineering for BuildTogether's Node.js + Express + TypeScript service (apps/api). Use when designing or implementing REST controllers/services/repositories, request validation, centralized error handling, authentication/authorization middleware, logging, environment configuration, API versioning, or input sanitization. Governs separation of concerns so database queries, business logic and HTTP handling never collapse into one file."
---

# Backend Engineering — BuildTogether API

Scope: `apps/api`. Node.js + Express + TypeScript. This skill governs how the HTTP
service is structured. It does not own the database schema (see `database-engineering`)
or Nexconn messaging (see `nexconn-integration`); it consumes them through clear seams.

## Layered architecture

Enforce strict separation. A request flows:

```
route -> middleware (auth, validation) -> controller -> service -> repository -> Prisma client
                                     \-> standardized response / error boundary
```

- **Controller**: parses the validated request, calls one or more services, maps the
  result to an HTTP response. No business rules, no SQL, no Prisma calls.
- **Service**: business logic and orchestration. Framework-agnostic (no `req`/`res`).
  Owns transactions and cross-repository coordination.
- **Repository**: the only layer that touches the Prisma client / SQL. Returns domain
  shapes, not raw DB rows, and never decides HTTP status codes.
- **Middleware**: cross-cutting concerns — auth, workspace scoping, validation, rate
  limiting, error translation, request logging.

Never import Express `Request`/`Response` into a service or repository. Never place
Prisma calls in a controller. If a controller exceeds ~40 lines or a service reaches
for `res`, refactor.

## Directory convention

```
apps/api/src/
  index.ts            # bootstrap: env load, middleware chain, listen
  app.ts              # express app factory (testable, no listen)
  routes/             # versioned routers, e.g. v1/index.ts
  controllers/
  services/
  repositories/
  middlewares/        # auth.ts, workspaceScope.ts, validate.ts, errorHandler.ts, requestLog.ts
  lib/                # prisma.ts (client singleton), logger.ts, env.ts (zod-validated config)
  errors/             # AppError, domain error types
  types/
```

## REST & API versioning

- Prefix every route with a version: `/api/v1/...`. New breaking changes land under a
  new version, not by editing shipped endpoints.
- Use resources and HTTP verbs semantically (`GET /tasks/:id`, `PATCH`, `POST`, `DELETE`).
- Plural nouns for collections; nested resources only for true ownership.
- Keep IDs as opaque strings; never leak internal auto-increment ordering as a contract.

## Consistent response envelope

Every JSON response uses one shape so the frontend can rely on it:

```jsonc
{ "data": <payload | null>, "error": null | { "code": "<machine_code>", "message": "<human>" }, "meta": { "requestId": "..." } }
```

Success sets `error: null`; failure sets `data: null`. Paginated lists carry
`meta.cursor` / `meta.limit`.

## Validation

- Validate **all** external input (body, query, params) at the edge with a schema
  library (zod) inside a `validate(schema)` middleware. Controllers receive typed,
  sanitized data only.
- Reject unknown fields on write endpoints. Coerce and clamp pagination limits.
- Sanitize any value used in file paths, redirects, or dynamic queries.

## Error handling

- Define a typed `AppError` with `statusCode`, `code`, and `message`. Throw domain
  errors from services; let a single `errorHandler` middleware at the end of the chain
  translate them to the response envelope.
- Never leak stack traces, SQL, or secrets in responses. Log the full error with the
  `requestId`; return only the safe message + code.
- Wrap async handlers so rejected promises reach `errorHandler` (a small
  `asyncHandler`/`Express 5` built-in, but confirm Express 5 auto-forwards rejections).

## Auth & authorization

- Authenticate identity in middleware, attach a typed `req.auth` (userId, roles).
- Authorize per-request against the **workspace scope** — see `security-review`. Every
  resource query must be constrained to a workspace the caller belongs to.
- Tokens and secrets stay server-side. Never accept a client-supplied workspace ID as a
  trusted scope; derive and verify membership server-side.

## Logging & configuration

- Structured JSON logger in `lib/logger.ts` (level, msg, requestId, context). No
  `console.log` in committed code.
- Load and validate config once in `lib/env.ts` from `process.env`; fail fast on missing
  required vars. Never read `process.env` scattered across modules.
- Redact secrets/PII from logs.

## Quality checks before finishing backend work

1. `pnpm --filter @buildtogether/api typecheck` and `lint` pass.
2. No Prisma import outside `repositories/` and `lib/prisma.ts`.
3. No `req`/`res` in services.
4. Every route is versioned and returns the standard envelope.
5. Every endpoint validates input and enforces workspace authorization.
6. `errorHandler` is the last middleware; unhandled errors never crash the process.

Report any deviation from these rules explicitly rather than silently introducing it.
