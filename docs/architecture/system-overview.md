# System Overview

BuildTogether is a chat-first team collaboration platform, delivered as a pnpm monorepo
with a clear frontend / backend / shared-contract separation.

## High-level topology

```
┌─────────────────────────┐        ┌──────────────────────────┐
│  apps/web               │  HTTPS │  apps/api                │
│  React + Vite + TS      │ ──────▶│  Express + TS            │
│  Tailwind, Motion       │  REST  │  route→mw→controller→    │
│  (design via Impeccable)│        │  service→repository      │
└───────┬─────────────────┘        └───────┬──────────┬───────┘
        │  SDK (token from api)            │          │ Prisma
        ▼                                  ▼          ▼
┌───────────────────────┐          ┌──────────────┐  ┌──────────────┐
│  Nexconn Chat SDK     │          │ AI service   │  │ PostgreSQL   │
│  (real-time transport,│          │ abstraction  │  │ (app metadata│
│   presence, receipts) │          │ (server-side)│  │  + relations)│
└───────────────────────┘          └──────────────┘  └──────────────┘
        ▲                                  │
        └──────── privileged ops ──────────┘
```

## Responsibility boundaries

- **apps/web** — UI, chat composition, task/kanban/decision surfaces. Talks to the API for
  app data and to the Nexconn SDK for real-time messaging (using a short-lived token the
  backend mints). Holds no secrets.
- **apps/api** — identity, workspace/team domain logic, authorization, conversation→task
  and decision metadata, token minting, AI orchestration. The only place credentials live.
- **PostgreSQL** — BuildTogether application state and relationships only. Explicitly **not**
  a copy of Nexconn's message store (see `nexconn-integration.md`, `database-architecture.md`).
- **Nexconn** — owns real-time transport, message delivery state, presence, read receipts.
- **AI layer** — provider-independent server-side abstraction for summaries/action
  extraction; introduced in a later phase.

## Key flows (target shape; built phase by phase)

1. **Conversation → task.** A user selects a message and creates a task; the frontend calls
   the API, which persists a task plus a provenance pointer (Nexconn message id) in
   Postgres. Real-time visibility of the message itself stays with Nexconn.
2. **Auth & connect.** Client authenticates to the API → API resolves the user's Nexconn
   identity and mints a scoped token → client connects to the Nexconn SDK with that token.
3. **Workspace isolation.** Every request is scoped to workspaces the authenticated user
   belongs to; authorization is enforced server-side on each query.

## Phasing

Phase 0 establishes this structure, the agent skills, tooling and documentation, and
compiling scaffolds — **no product features**. Subsequent phases build capabilities in
`docs/development/phase-roadmap.md`. Each domain is detailed in the sibling architecture
docs and governed by the matching skill in `.claude/skills/`.
