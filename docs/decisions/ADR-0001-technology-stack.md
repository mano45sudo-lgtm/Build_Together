# ADR-0001 — Technology Stack

- **Status:** Accepted (Phase 0) · Amended (Phase 1 — added Electron desktop runtime; see ADR-0002) · Amended (Phase 2 — self-managed identity/auth dependencies; see ADR-0003)
- **Date:** 2026-11-03
- **Deciders:** Product brief + Principal Architect (this phase)

## Context

BuildTogether needs a stack for a chat-first, real-time, multi-tenant collaboration product
that must be modular, maintainable, polished, and safe. The initial direction is provided by
the product brief. This ADR records the choices, the reasoning, the rejected alternatives,
and the conditions under which they may be revisited — including the versions actually
installed in Phase 0 (stable releases only).

## Decision

| Layer                      | Choice                                                                        | Phase 0 pinned version                                                         |
| -------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Frontend framework         | React + TypeScript on Vite                                                    | react 19.3.1, typescript 6.0.3, vite 8.3.5                                     |
| Desktop runtime            | **Electron** (desktop-first; see [ADR-0002](./ADR-0002-desktop-framework.md)) | electron 45.2.1, electron-vite 6.0.0, electron-builder 26.18.0 (added Phase 1) |
| Styling                    | Tailwind CSS (v4, CSS-first config)                                           | tailwindcss 4.3.4, @tailwindcss/vite 4.3.4                                     |
| Animation                  | Motion for React                                                              | motion 14.9.0                                                                  |
| Icons                      | Lucide                                                                        | lucide-react 1.67.0                                                            |
| Backend                    | Node.js + Express + TypeScript                                                | express 5.3.0, tsx 4.23.15                                                     |
| Identity / auth            | Self-managed in `apps/api` (see ADR-0003)                                     | @node-rs/argon2 2.2.2, express-rate-limit 8.7.2, zod 4.6.7 (added Phase 2)     |
| DB driver (Prisma 7 query) | PostgreSQL driver adapter                                                     | @prisma/adapter-pg 7.10.1, pg 8.23.1, dotenv 18.0.9 (added Phase 2)            |
| Database                   | PostgreSQL + Prisma                                                           | prisma / @prisma/client **7.10.1 (stable)**                                    |
| Real-time                  | Nexconn Chat SDK (managed messaging)                                          | integrated in a later phase, per official docs                                 |
| AI                         | provider-independent server-side abstraction                                  | later phase                                                                    |
| Package manager / repo     | pnpm workspaces (monorepo)                                                    | pnpm 11.8.0                                                                    |
| Lint / format              | ESLint (flat config) + Prettier                                               | eslint 10.14.0, prettier 3.9.10                                                |
| Unit/integration/component | Vitest                                                                        | vitest 5.1.0                                                                   |
| Browser E2E                | Playwright                                                                    | @playwright/test 1.64.1                                                        |

## Rationale / trade-offs

- **React + Vite + TS** — large ecosystem, fast DX, type safety end-to-end; Vite gives quick
  HMR and a modern build. Tailwind v4's CSS-first `@theme` maps cleanly onto the token-based
  design in `DESIGN.md`.
- **Motion + Lucide** — sanctioned by the brief; transform/opacity-friendly animation and a
  consistent, tree-shakeable icon set support the "subtle motion, restrained identity" goal.
- **Express + layered TS backend** — mature, minimal, pairs with the controller/service/
  repository separation in `backend-engineering`.
- **Prisma + PostgreSQL** — typed schema, version-controlled migrations, referential
  integrity for a relational, workspace-scoped domain.
- **Nexconn for real-time** — delegates transport/presence/receipts to a managed provider so
  BuildTogether doesn't rebuild chat infrastructure (product constraint).
- **pnpm monorepo** — workspace isolation with shared `packages/shared` contracts; strict,
  disk-efficient installs.
- **Stable-only versions** — brief forbids deprecated/pre-release packages: `prisma@latest`
  was an `8.0.0-rc`, so we pinned the stable `7.10.1` line instead.

## Compatibility adjustments found during Phase 1 (desktop)

Each verified by running the toolchain, not assumed:

1. **`electron-vite@6` requires the entry under `build.lib.entry`, not a top-level
   `main.entry`.** The v6 config schema rejected the top-level field ("An entry point is
   required"); main/preload entries were moved to `build.lib.entry`.
2. **`apps/desktop/package.json` has no `"type": "module"`.** A sandboxed preload must be
   CommonJS, so main/preload emit CJS; the renderer is a separate static ESM build.
3. **`externalizeDepsPlugin({ exclude: ['@buildtogether/shared'] })`** — the source-only
   workspace package must be **bundled** into main/preload (Node cannot import raw `.ts` at
   runtime), otherwise a packaged launch throws `ERR_MODULE_NOT_FOUND`.
4. **`electron-vite@6` peer `vite ^6 ‖ ^7 ‖ ^8`** is compatible with our existing Vite 8.3.5 —
   confirmed by a passing main/preload/renderer build; no Vite downgrade was needed.
5. The Electron binary is fetched post-install; if absent run
   `node node_modules/electron/install.js`.

## Compatibility adjustments found during Phase 0 validation

These are documented deviations from the initial direction, each verified by running the
toolchain (not assumed):

1. **TypeScript pinned to stable 6.0.3, not the registry default 7.0.2.** `typescript-eslint`
   (8.72.1, latest) hard-errors on TS 7.0 — "typescript-eslint does not support TS 7.0";
   its maintainers track support for TS ≥ 7.1 (not yet released). Since ESLint linting is a
   required Phase 0 check, the workspace uses TS 6.0.3 (the current stable 6.x) which
   typescript-eslint supports. Everything (typecheck, Vite build, `tsc` emit, tsx, Vitest)
   passes on 6.0.3. **Revisit** to TS 7.x once typescript-eslint ships TS 7 support.
2. **Prisma datasource `url` moved out of `schema.prisma`.** Prisma 7 rejects `url` in the
   datasource block (error P1012). The schema now declares only `provider = "postgresql"`;
   the connection URL is supplied via `prisma.config.ts` (Migrate CLI) and to the client at
   runtime. `prisma validate` and `prisma generate` pass. No `prisma.config.ts` is required
   in Phase 0 (generate/validate work without it); it is added when migrations begin.

## Compatibility adjustments found during Phase 2 (identity & auth)

Each verified by running the toolchain and the passing backend suite, not assumed:

1. **Prisma 7 needs a driver adapter at runtime.** The Query Compiler has no bundled Postgres
   driver, so the client is constructed through `@prisma/adapter-pg` (`pg`) with the connection
   URL from env (`dotenv`). This replaces the classic bundled-engine client init.
2. **`@node-rs/argon2` (prebuilt N-API), not `argon2` (node-gyp)** — installs on Windows with no
   compiler; Argon2id is the library default. The `Algorithm` const enum is not importable under
   `verbatimModuleSyntax`, so the default id mode is used rather than a named constant.
3. **`express-rate-limit` v8 (draft-7 handler)** — the old `keyGenerator`/`handler` defaults
   changed; dedicated `makeAuthLimiter`/`makeInviteLimiter` factories wrap the v8 API and set a
   trust-proxy-independent key so a reverse proxy cannot defeat throttling.
4. **`zod` v4 at the route edge** — parse-then-handle; error shaping reads the v4 `issues`
   structure (`.flatten` is removed in v4), so validation output is mapped explicitly.
5. **Opaque hashed sessions over JWT** — no token library added; sessions are SHA-256 rows with
   family-based rotation/reuse detection, keeping the dependency set small and revocation
   server-authoritative (see ADR-0003).

## Rejected alternatives

- **Next.js / SSR** — rejected: this is an app-like authenticated workspace, not a
  content/SEO site; Vite SPA fits better and is simpler.
- **tRPC / GraphQL** — deferred: brief specifies a REST API; revisit only if contract needs
  grow (would need a new ADR).
- **MongoDB / other SQL (MySQL)** — rejected: relational integrity + workspace scoping suit
  Postgres; Prisma is the specified ORM.
- **Building our own WebSocket chat layer** — rejected outright: conflicts with the product
  constraint that Nexconn owns messaging.
- **Redux global state** — rejected: unnecessary global state is discouraged; server state +
  local/derived state is the default.

## Consequences

- Positive: cohesive typed stack; clear separation; provider-delegated real-time; reusable
  design tokens; monorepo contracts.
- Costs/risks: Prisma version churn (pin + migrate carefully); Nexconn capabilities must be
  confirmed from official docs before integration; Tailwind v4 is CSS-first (older config
  patterns don't apply).

## Applicable / expiry conditions

Applies while building BuildTogether's core app. Revisit any row when: a documented
compatibility/technical issue arises (then record a new ADR), a stable dependency reaches
end-of-life, or Nexconn/AI provider capabilities materially change the boundary. Version
bumps follow the stable channel only.
