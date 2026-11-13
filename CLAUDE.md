# CLAUDE.md — BuildTogether

> Canonical project instructions for AI coding agents working on BuildTogether.
> `AGENTS.md` points here. Detailed domain rules live in `.claude/skills/*`. Load
> `phase-execution` first in any session, then the skills matching the task.

## 1. Product overview

**BuildTogether** — _From Conversation to Completion._ A **desktop-first** team
collaboration product (a "Builder Workspace", built on Electron) where conversations become
actionable work: messaging, project channels, task creation from messages, Kanban, a
Decision Vault, Team Pulse, and AI-assisted summaries. It unifies messaging + project
management + decisions that are usually scattered across separate tools. Real-time chat is
powered by the **Nexconn Chat SDK** (integrated in a later phase).

## 2. Product philosophy

- Communication should lead to execution.
- Preserve the context behind every important task.
- Keep collaboration intuitive and frictionless.
- Build modular, maintainable software; avoid unnecessary complexity.
- Prioritize a polished user experience.
- Never introduce features without a clear product reason.

## 3. Technology stack

- **Desktop** (`apps/desktop`): **Electron** (main + sandboxed preload) with a React,
  Vite, TypeScript, Tailwind CSS, Motion (`motion`), Lucide **renderer**. Desktop-first;
  the renderer is untrusted and reaches the OS only via the typed `window.bt` IPC bridge.
- **Backend** (`apps/api`): Node.js, Express, TypeScript.
- **Database**: PostgreSQL + Prisma ORM, version-controlled migrations.
- **Real-time**: Nexconn Chat SDK (Nexconn-managed messaging infrastructure).
- **AI layer**: provider-independent AI service abstraction; server-side credentials;
  introduced in a later phase.
- **Tooling**: pnpm, Git, ESLint, Prettier, Vitest, Playwright.

Keep versions to current **stable** releases; no deprecated or pre-release packages
(e.g. Prisma stays on the stable `7.x` line, not the `8.x` RC). Add no library without a
stated need.

## 4. Repository architecture

```
BuildTogether/
├── apps/
│   ├── desktop/        # Electron client: electron/main + electron/preload + React src
│   │                   #   (@buildtogether/desktop; the renderer replaces the old apps/web)
│   ├── api/            # Express backend + Prisma (@buildtogether/api)
│   └── mcp/            # read-only MCP server over intelligence (@buildtogether/mcp)
├── packages/
│   └── shared/         # shared TS types & API contracts (@buildtogether/shared)
├── e2e/                # Playwright end-to-end specs
├── docs/               # architecture, engineering, product, decisions, development
├── .claude/
│   ├── skills/         # Impeccable + 7 project skills
│   └── settings.json   # shared project config (hooks live in settings.local.json)
├── CLAUDE.md           # this file — canonical instructions
├── AGENTS.md           # pointer to CLAUDE.md for other agents
├── PRODUCT.md          # product truth (Impeccable schema)
├── DESIGN.md           # design system / visual language
├── pnpm-workspace.yaml
└── package.json
```

Data flows: the `desktop` **renderer** → typed `apiClient` → `api`
(route→middleware→controller→service→repository→Prisma); it resolves the environment-aware
API base from the trusted **main** process over the `window.bt` bridge (never a hardcoded
localhost prod URL). Real-time events flow Nexconn SDK → renderer. `shared` holds the
request/response **and desktop IPC** contracts (`desktop.ts`) both sides compile against.

## 5. Coding standards & naming

- TypeScript strict everywhere; no `any` at untyped boundaries without a wrapper.
- Files/exports: components `PascalCase.tsx`, hooks `useCamelCase.ts`, other modules
  `kebab-case.ts`, types/interfaces `PascalCase`, constants `UPPER_SNAKE`.
- Small single-responsibility modules; no monolithic components or giant controllers.
- Favor explicit over clever; comments explain _why_, never restate _what_.
- No dead code, no TODO-only stubs presented as complete.

## 6. Domain rules (see the matching skill for detail)

- **Frontend** → `frontend-engineering` skill. Visual design authority is **Impeccable**
  - `DESIGN.md`.
- **Backend** → `backend-engineering` skill. Layered separation; consistent response
  envelope; validate all input; centralized error handler.
- **Database** → `database-engineering` skill. Workspace-scoped entities; no destructive
  migration without justification; never duplicate Nexconn messaging state.
- **Nexconn** → `nexconn-integration` skill. **Consult official docs; never hallucinate
  SDK methods.** App Secrets stay server-side; only BT metadata in Postgres.
- **Testing** → `testing-qa` skill. A phase is not done because it compiles.
- **Security** → `security-review` skill. Workspace isolation is a hard boundary.

## 7. Security requirements (minimum bar)

- Auth on non-public endpoints; workspace-scoped authorization on every query (no IDOR).
- Secrets only in env, never committed, never in the client bundle or logs.
- Validate/sanitize all input; parameterized DB access only; explicit CORS allow-list;
  rate-limit auth/expensive routes; secure upload handling.

## 8. Testing requirements

Unit + integration (Vitest), component (Vitest + Testing Library), E2E (Playwright).
Every feature names its happy / error / empty / edge / authorization cases up front.
Abstract Nexconn behind an interface for deterministic tests. Report real results only.

## 9. Documentation requirements

Architecture decisions → `docs/decisions` (ADR). Durable design → `docs/*`. Product truth
→ `PRODUCT.md`. Visual language → `DESIGN.md`. Running log → `docs/development/
implementation-log.md`. Update docs as part of the phase, not afterward. Keep it
project-specific, not generic filler.

## 10. Phase execution policy

- **Only the currently authorized phase.** Load `phase-execution` and obey it.
- Inspect before modifying; adapt existing structure; never blindly overwrite.
- No premature future-phase features; no fake screens to feign completeness.
- End every phase with the 10-item completion protocol and **stop** — do not auto-start
  the next phase. Never claim an unrun test passed.

## 11. Git conventions

- Conventional Commits: `feat:` `fix:` `refactor:` `docs:` `test:` `chore:`.
- Branch naming: `phase-<n>-<short-slug>` or `feat/`, `fix/`, `chore/` prefixes.
- Never commit secrets, `.env`, or build artifacts. No history rewrites of shared branches.
- Commit only when the work is coherent and checks pass.

## 12. Dependency management

- pnpm workspaces only; install at the repo root; commit `pnpm-lock.yaml`.
- Shared tooling (ESLint, Prettier, TypeScript) lives at the root and is extended by
  apps; avoid per-app forks.
- Prefer framework-native solutions over adding libraries. Review new deps for need,
  maintenance, and vulnerabilities (`pnpm audit`).

## Common commands

```bash
pnpm install                 # install all workspace deps (run at repo root)
pnpm --filter @buildtogether/api dev   # API on :4000
pnpm desktop:dev             # Electron + renderer (HMR on :5173)
pnpm desktop:build           # compile main/preload/renderer to apps/desktop/out
pnpm desktop:package         # electron-builder (configured; not run in Phase 1)
pnpm lint                    # ESLint across workspace
pnpm format                  # Prettier write
pnpm typecheck               # tsc --noEmit across workspace
pnpm test                    # Vitest across workspace
pnpm --filter @buildtogether/api prisma:generate
```
