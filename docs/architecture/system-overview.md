# System Overview

BuildTogether is a **desktop-first** team collaboration product (a "Builder Workspace"),
delivered as a pnpm monorepo with a clear desktop-client / backend / shared-contract
separation. The client is an Electron app; its React renderer was migrated from the retired
browser-only `apps/web` (see [ADR-0002](../decisions/ADR-0002-desktop-framework.md)).

## High-level topology

```
┌───────────────────────────────┐        ┌──────────────────────────┐
│  apps/desktop (Electron)      │        │  apps/api                │
│  main (trusted) ── preload ──▶│ HTTPS  │  Express + TS            │
│   │  typed window.bt IPC      │ ──────▶│  route→mw→controller→    │
│   ▼                           │  REST  │  service→repository      │
│  renderer: React + Vite + TS  │        │  (health only in Phase 1)│
│  Tailwind, Motion (Impeccable)│        └───────┬──────────┬───────┘
└───────┬───────────────────────┘                │          │ Prisma
        │  SDK (token from api, later phase)     ▼          ▼
┌───────────────────────┐          ┌──────────────┐  ┌──────────────┐
│  Nexconn Chat SDK     │          │ AI service   │  │ PostgreSQL   │
│  (real-time transport,│          │ abstraction  │  │ (app metadata│
│   presence, receipts) │          │ (server-side)│  │  + relations)│
└───────────────────────┘          └──────────────┘  └──────────────┘
        ▲                                  │
        └──────── privileged ops ──────────┘
```

## Responsibility boundaries

- **apps/desktop** — the Electron client. A trusted **main** process (window, lifecycle,
  environment-aware config, IPC, native menu, security guards) + a sandboxed **preload**
  bridge exposing only the typed `window.bt` API + a **renderer** (the React app: chat
  composition, task/kanban/decision surfaces). The renderer holds no secrets, gets config
  over IPC, and talks to the API for app data and (in a later phase) the Nexconn SDK for
  real-time messaging via a short-lived backend-minted token. See `desktop-architecture.md`.
- **apps/api** — identity, workspace/team domain logic, authorization, conversation→task
  and decision metadata, token minting, AI orchestration. The only place credentials live.
- **PostgreSQL** — BuildTogether application state and relationships only. Explicitly **not**
  a copy of Nexconn's message store (see `nexconn-integration.md`, `database-architecture.md`).
- **Nexconn** — owns real-time transport, message delivery state, presence, read receipts.
- **AI layer** — provider-independent server-side abstraction for summaries/action
  extraction; introduced in a later phase.

## Key flows (target shape; built phase by phase)

1. **Conversation → task.** A user selects a message and creates a task; the renderer calls
   the API (resolved via `window.bt.getConfig()`), which persists a task plus a provenance pointer (Nexconn message id) in
   Postgres. Real-time visibility of the message itself stays with Nexconn.
2. **Auth & connect.** Client authenticates to the API → API resolves the user's Nexconn
   identity and mints a scoped token → client connects to the Nexconn SDK with that token.
3. **Workspace isolation.** Every request is scoped to workspaces the authenticated user
   belongs to; authorization is enforced server-side on each query.

## Phasing

Phase 0 established the monorepo structure, agent skills, tooling and documentation, and
compiling scaffolds. **Phase 1** converted the client to a **desktop-first Electron**
architecture — `apps/desktop` (main/preload/renderer) with a hardened IPC bridge, a design-
token foundation and an app shell — and retired `apps/web`. It ships a secure, running
desktop shell and **no product features** (no auth, workspaces, messaging, tasks or AI).
Subsequent phases build capabilities in `docs/development/phase-roadmap.md`. Each domain is
detailed in the sibling architecture docs and governed by the matching skill in
`.claude/skills/`.
