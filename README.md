# BuildTogether

**From Conversation to Completion.** A chat-first team collaboration platform where
conversations become actionable work — messaging, project channels, conversation-to-task
conversion, a Kanban board, a Decision Vault, Team Pulse, and AI-assisted summaries, in one
place instead of scattered across chat, PM and docs tools.

> **Status: Phase 0 (engineering environment).** The repository is prepared for development;
> **no product features are implemented yet.** Work proceeds in explicitly authorized phases.

## Stack

React + Vite + TypeScript + Tailwind CSS (v4) + Motion + Lucide · Node.js + Express +
TypeScript · PostgreSQL + Prisma · Nexconn Chat SDK (real-time) · pnpm monorepo · ESLint,
Prettier, Vitest, Playwright. See [`docs/decisions/ADR-0001-technology-stack.md`](docs/decisions/ADR-0001-technology-stack.md).

## Repository layout

```
apps/
  web/            @buildtogether/web    React/Vite client
  api/            @buildtogether/api    Express + Prisma service
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
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env   # fill local values; never commit .env
pnpm dev                     # run web + api together
```

Individual apps: `pnpm --filter @buildtogether/web dev` ·
`pnpm --filter @buildtogether/api dev`.

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

Phase 0 environment → **1** workspaces/identity/authz → **2** Nexconn real-time →
**3** conversation→tasks/Kanban → **4** Decision Vault/Team Pulse → **5** AI layer. Each
phase is gated: it ends with a completion report and waits for explicit authorization to
continue. See [`docs/development/phase-roadmap.md`](docs/development/phase-roadmap.md).

## License

Private / all rights reserved (internal product).
