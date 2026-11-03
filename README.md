# BuildTogether

**From Conversation to Completion.** A **desktop-first** team collaboration product (a
"Builder Workspace") where conversations become actionable work — messaging, project
channels, conversation-to-task conversion, a Kanban board, a Decision Vault, Team Pulse, and
AI-assisted summaries, in one place instead of scattered across chat, PM and docs tools.

> **Status: Phase 1 complete (desktop product foundation).** The Electron client
> (main/preload/renderer), app shell and design-token foundation are in place with a secure
> IPC bridge. **No product features are implemented yet** (no auth, workspaces, messaging or
> tasks). Work proceeds in explicitly authorized phases.

## Stack

**Electron** (main + sandboxed preload) · React + Vite + TypeScript + Tailwind CSS (v4) +
Motion + Lucide (renderer) · Node.js + Express + TypeScript · PostgreSQL + Prisma · Nexconn
Chat SDK (real-time, later phase) · pnpm monorepo · ESLint, Prettier, Vitest, Playwright.
See [`ADR-0001`](docs/decisions/ADR-0001-technology-stack.md) and
[`ADR-0002`](docs/decisions/ADR-0002-desktop-framework.md).

## Repository layout

```
apps/
  desktop/        @buildtogether/desktop  Electron client (main/preload + React renderer)
  api/            @buildtogether/api      Express + Prisma service
packages/
  shared/         @buildtogether/shared shared TS contracts
e2e/              Playwright specs
docs/             architecture · engineering · product · decisions · development
.claude/          Impeccable + 7 project skills, agents, hooks, settings
CLAUDE.md         canonical agent instructions
AGENTS.md         pointer to CLAUDE.md
PRODUCT.md        product truth      DESIGN.md   visual language
```

## Getting started

Requires Node ≥ 20 and pnpm ≥ 9.

```bash
pnpm install                 # install all workspace deps (repo root)
cp apps/desktop/.env.example apps/desktop/.env
cp apps/api/.env.example apps/api/.env   # fill local values; never commit .env
pnpm --filter @buildtogether/api dev     # API on :4000
pnpm desktop:dev             # Electron + renderer (HMR on :5173)
```

Build the desktop bundles: `pnpm desktop:build` (→ `apps/desktop/out`). Package
(installers) via `pnpm desktop:package` — configured, not run in Phase 1.

## Checks

```bash
pnpm lint            # ESLint
pnpm format:check    # Prettier
pnpm typecheck       # tsc --noEmit across workspace
pnpm build           # build all packages
pnpm test            # Vitest across workspace
# Playwright (when E2E begins): pnpm exec playwright install && pnpm test:e2e
```

## Agent environment

Project instructions live in [`CLAUDE.md`](CLAUDE.md); other agents read [`AGENTS.md`](AGENTS.md)
which points back to it. Coding-agent skills are under [`.claude/skills/`](.claude/skills) —
the **Impeccable** design skill (installed at project scope) plus seven project skills:
`backend-engineering`, `database-engineering`, `nexconn-integration`, `frontend-engineering`,
`testing-qa`, `security-review`, `phase-execution`.

Start any working session by loading `phase-execution`, then the skills matching the task.
Run `/impeccable init` to (re)establish design context; product truth is captured in
`PRODUCT.md` and the visual language in `DESIGN.md`.

## Documentation

- Architecture — [`docs/architecture/`](docs/architecture)
- Engineering (standards, testing, security, env setup) — [`docs/engineering/`](docs/engineering)
- Product (requirements, roles, feature map) — [`docs/product/`](docs/product)
- Decisions (ADRs) — [`docs/decisions/`](docs/decisions)
- Development (roadmap, implementation log) — [`docs/development/`](docs/development)

## Phase plan

Phase 0 environment → **1** desktop product foundation (Electron) → **2**
workspaces/identity/authz → **3** Nexconn real-time → **4** conversation→tasks/Kanban →
**5** Decision Vault/Team Pulse → **6** AI layer. Each phase is gated: it ends with a
completion report and waits for explicit authorization to continue. See
[`docs/development/phase-roadmap.md`](docs/development/phase-roadmap.md).

## License

Private / all rights reserved (internal product).
