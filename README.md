# BuildTogether

**From Conversation to Completion.** A desktop-first team collaboration product — a "Builder
Workspace" where conversations turn into actionable work. Messaging, project channels, task
management with dependencies and a Kanban board, a Decision Vault, and a deterministic
execution-intelligence engine live in one place instead of scattered across chat, project
management, and docs tools.

---

## Status

BuildTogether is delivered in explicitly authorized, phase-gated increments. Each phase ends with
a completion report and an explicit stop before the next one begins.

| Phase | Scope                                       | State                                                       |
| ----- | ------------------------------------------- | ----------------------------------------------------------- |
| 0     | Engineering environment, tooling, docs      | Complete                                                    |
| 1     | Desktop product foundation (Electron shell) | Complete                                                    |
| 2     | Identity, workspaces, teams & authorization | Complete                                                    |
| 3     | Real-time communication (Nexconn)           | Complete                                                    |
| 4     | Projects & project structure                | Complete                                                    |
| 5     | Task management, ownership & dependencies   | Complete                                                    |
| 6     | Decision Vault                              | Complete (Team Pulse not started)                           |
| 7     | Execution Intelligence Engine               | Deterministic backend foundation complete; AI seam deferred |

The product currently runs end-to-end: authenticated desktop client, real-time messaging,
project/task/decision workflows, and explainable, deterministic project intelligence. Quality
gates are green across the workspace (**182** backend tests / **11** files and **36** desktop
tests / **5** files).

Deliberately **not** present (by design, not omission): an AI/LLM provider, notification
producer/consumer wiring, and desktop surfaces for the intelligence layer — these are authorized
later increments. See [Roadmap](#roadmap).

---

## What it does

### Identity & teams

- Self-managed accounts with Argon2id password hashing and opaque, server-side hashed sessions
  (rotation + token-family reuse detection).
- Workspaces with OWNER / ADMIN / MEMBER roles, enforced server-side on every request.
- Secure invitations: random tokens stored only as hashes, expiring, single-use, and bound to the
  target email and role.

### Real-time communication

- Workspace-level **GROUP** and **DIRECT** conversations over the Nexconn (RongCloud) SDK.
- The backend owns identity mapping, short-lived user-scoped token minting, conversation metadata,
  and signature-verified webhooks. It stores **no message bodies** — Nexconn owns the message stream.
- The sandboxed renderer talks to Nexconn directly for send / history / typing / unread.

### Projects & tasks

- Workspace-scoped projects with a unique `projectKey`/`slug`, visibility (`PUBLIC`/`PRIVATE`), and
  server-side project RBAC.
- Tasks with owners, status, priority, due dates, and dependencies. Dependencies are validated
  server-side (same project, no self-edge, no duplicates, cycles rejected via DFS).
- A **blocked** state derived on read from unfinished prerequisites — never stored and never
  auto-changing a task's workflow status.
- List and Kanban views (To Do / In Progress / In Review / Done) plus a cross-project **My Work**
  screen, all backed by live data.

### Decision Vault

- First-class `Decision` records with a closed lifecycle state machine
  (`DRAFT → PROPOSED → APPROVED / REJECTED`, plus `SUPERSEDED` / `ARCHIVED`).
- Considered alternatives, typed references (task / conversation / decision / document / link /
  file), participants, an accountable owner (separate from authorship), a history timeline, and a
  comments thread.
- A supersede chain that supports decision-revision impact analysis.

### Execution Intelligence (deterministic foundation)

Contextual, explainable intelligence layered on top of the existing data — **not** a chatbot. It
ships full value with zero AI present.

- **Project health** — On Track / Needs Attention / At Risk, derived from real completion, overdue,
  blocked, deadline, and decision-review facts (worst-severity rules, never an arbitrary score).
- **Blocker detection** — structured sources only: unfinished or overdue prerequisites, work
  awaiting a decision, and decisions needing review.
- **Risk & deadline intelligence** — Low / Medium / High, each explaining WHAT / WHY / EVIDENCE /
  ACTION.
- **Next-best-actions** — evidence-backed recommendations derived from already-detected signals,
  dismissible or resolvable, never auto-executed.
- **Decision-revision impact** — which live tasks may need review when a decision is superseded.
- **Personal intelligence** — the caller's own overdue / upcoming / blocked / awaiting-review work.

All intelligence is computed on read and never persisted, so a snapshot can never drift from
reality. Every threshold lives in one place, and each detector is a pure function over
already-authorized data.

---

## Tech stack

| Layer      | Technology                                                                           |
| ---------- | ------------------------------------------------------------------------------------ |
| Desktop    | Electron 45 (main + sandboxed preload + renderer), hardened typed IPC, CSP, `app://` |
| Renderer   | React, Vite, TypeScript, Tailwind CSS v4, Motion, Lucide                             |
| API        | Node.js, Express, TypeScript                                                         |
| Database   | PostgreSQL 15+, Prisma ORM (`@prisma/adapter-pg`)                                    |
| Real-time  | Nexconn (RongCloud) Chat SDK — server SDK + Web IMLib                                |
| Validation | Zod (edge request/query validation)                                                  |
| Monorepo   | pnpm workspaces                                                                      |
| Quality    | ESLint, Prettier, Vitest, Playwright                                                 |

Architecture decisions are recorded as ADRs in [`docs/decisions/`](docs/decisions).

---

## Architecture

### Topology

```
apps/desktop (Electron)                    apps/api (Express + Prisma)
  main (trusted)  ── preload ──▶  HTTPS ──▶  route -> middleware -> controller
    |  typed window.bt IPC          REST      -> service -> repository -> Prisma
    v                                                              |
  renderer: React + Vite + TS                                      v
    |  Nexconn Web IMLib (direct, token from api)          PostgreSQL  |  Nexconn
    v                                                    (metadata +   (message
  app data via API                                          relations)  stream)
```

- **apps/desktop** — the Electron client. A trusted main process owns the session (in `safeStorage`),
  is the sole authenticated API caller, and exposes only named, argument-validated IPC to a
  sandboxed renderer. **Tokens and secrets never reach the renderer.**
- **apps/api** — identity, workspace and domain logic, authorization, token minting, and the
  intelligence engine. The only place credentials live.
- **PostgreSQL** — application state and relationships only. Not a copy of Nexconn's message store.
- **Nexconn** — owns real-time transport, delivery, presence, and read receipts.

### Layering (backend)

Requests flow `route -> middleware -> controller -> service -> repository -> Prisma`, and only
repositories touch the database. Controllers stay thin; services hold no `req`/`res`. Every
response uses the `{ data, error, meta }` envelope, with failures surfaced as typed application
errors. The REST surface is versioned under `/api/v1`.

### Security model

- **Workspace isolation is a hard boundary.** The path `workspaceId` is never trusted — membership
  and role are resolved fresh from the database. A cross-workspace identifier returns **404** (no
  existence leak); a non-member returns **403**.
- **PRIVATE** projects (and their tasks/decisions) are invisible to non-entitled readers (**404**).
- Optional integrations **fail closed**: with no Nexconn credentials, chat returns 503 rather than a
  fake success; with no AI provider, the deterministic intelligence still works unchanged.
- Server-side secrets (Nexconn App Secret, DB, session) live only in `apps/api/.env` and are never
  committed or exposed to the client.

---

## Project layout

```
apps/
  desktop/            @buildtogether/desktop   Electron client: main/preload + React renderer
  api/                @buildtogether/api       Express + Prisma service
packages/
  shared/             @buildtogether/shared    shared TypeScript DTO contracts (consumed as source)
e2e/                  Playwright specs
docs/
  architecture/       system, backend, frontend, desktop, database, Nexconn integration
  engineering/        coding standards, testing strategy, security guidelines, environment setup
  product/            requirements, user roles, feature map
  decisions/          ADR-0001 .. ADR-0005
  development/        phase roadmap, implementation log
CLAUDE.md             canonical project instructions
AGENTS.md             pointer to CLAUDE.md
PRODUCT.md            product truth
DESIGN.md             visual language (monochrome design system)
```

---

## Getting started

### Prerequisites

| Tool       | Version                     | Notes                         |
| ---------- | --------------------------- | ----------------------------- |
| Node.js    | >= 20 LTS (verified on v24) | Required by Vite and tooling. |
| pnpm       | >= 9 (verified on 11.x)     | Workspace package manager.    |
| Git        | any recent                  | Conventional Commits.         |
| PostgreSQL | 15+                         | Required from Phase 2 onward. |
| Electron   | stable 45.x                 | Downloaded by `pnpm install`. |

### 1. Install and configure

```bash
pnpm install                                   # at the repo root
cp apps/desktop/.env.example apps/desktop/.env
cp apps/api/.env.example     apps/api/.env     # fill local values; never commit .env
```

### 2. Start PostgreSQL

A local Docker container is the documented default:

```bash
docker run -d --name bt-postgres \
  -e POSTGRES_USER=buildtogether -e POSTGRES_PASSWORD=buildtogether \
  -e POSTGRES_DB=buildtogether -p 5432:5432 postgres:16-alpine
```

### 3. Apply migrations and generate the client

```bash
pnpm --filter @buildtogether/api prisma:migrate
pnpm --filter @buildtogether/api prisma:generate
```

### 4. Run

```bash
pnpm --filter @buildtogether/api dev   # API on http://localhost:4000
pnpm desktop:dev                       # Electron + renderer (HMR on :5173)
```

Desktop build and packaging: `pnpm desktop:build` (bundles to `apps/desktop/out`); installers via
`pnpm desktop:package` (electron-builder, configured).

> Chat is optional at runtime. Leaving `NEXCONN_APP_KEY` / `NEXCONN_APP_SECRET` unset disables the
> chat module and it fails closed; every other feature works normally.

---

## Testing & quality gates

From the repo root:

```bash
pnpm lint            # ESLint across the workspace
pnpm format:check    # Prettier
pnpm typecheck       # tsc --noEmit
pnpm build           # build all packages
pnpm test            # Vitest (backend + desktop)
# Playwright (when E2E begins): pnpm exec playwright install && pnpm test:e2e
```

- **Backend** integration tests run over real HTTP against a real PostgreSQL database (the API needs
  the `bt-postgres` container running). Unit tests cover the pure intelligence detectors.
- **Current state:** typecheck, production build, ESLint, and Prettier are all green; the full suite
  passes at **182 backend** tests and **36 desktop** tests.
- The project never reports an unrun test as passing and never fakes a screen or a result.

---

## Documentation

- Architecture — [`docs/architecture/`](docs/architecture)
- Engineering standards, testing, security, environment — [`docs/engineering/`](docs/engineering)
- Product requirements, roles, feature map — [`docs/product/`](docs/product)
- Decision records (ADRs) — [`docs/decisions/`](docs/decisions)
- Roadmap and implementation log — [`docs/development/`](docs/development)

---

## Development model

Delivery is **phase-gated**: only the currently authorized phase is executed, each phase is verified
against real infrastructure, and it ends with a completion report and a stop. Code is inspected
before it is modified, existing architecture is reused rather than duplicated, and stable
dependencies are preferred. The full policy lives in [`CLAUDE.md`](CLAUDE.md) and the
`phase-execution` skill under [`.claude/skills/`](.claude/skills).

### Roadmap

Completed and current: identity & teams, real-time communication, projects, tasks & Kanban, the
Decision Vault, and the deterministic execution-intelligence foundation.

Deferred (authorized later increments):

- **AI context layer** — a provider-independent, server-side, optional seam that may only add
  clearly-labeled, evidence-backed signals; it never fabricates health or mutates data. No vendor
  dependency is committed.
- **Notifications** — the first-class, workspace-scoped `Notification` model and migration already
  exist; the producer/consumer wiring that emits and serves them is pending.
- **Team Pulse** — cross-workspace activity and progress signals.
- **Desktop intelligence surfaces** — UI over the `/intelligence` API.

Out of scope by design: autonomous agents, automatic task or decision rewriting, auto-assignment,
productivity surveillance, a generic chatbot, and unrestricted AI access to data.

---

## Conventions

- **Conventional Commits.**
- **pnpm workspaces** with shared contracts consumed as source from `@buildtogether/shared`.
- **Non-destructive, additive migrations** only; no prior-phase data is dropped or rewritten.
- **Type-safe boundaries** — strict TypeScript settings (including `noUncheckedIndexedAccess` on the
  API and `exactOptionalPropertyTypes` on the desktop).
- Formatting is enforced by Prettier and lint by ESLint as part of every phase gate.

---

## License

Private / all rights reserved (internal product).
