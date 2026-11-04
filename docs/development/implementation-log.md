# Implementation Log

Running record of completed phases. Newest first. Full detail for a phase lives in its
completion report; this log is the durable summary.

---

## Phase 3 — Real-Time Communication (Nexconn)

**Date:** 2026-11-04 · **Status:** Complete & mocked-verified (see acceptance in the phase report) ·
**Scope:** functional, secure, workspace-scoped real-time messaging over the **real** Nexconn
(RongCloud) SDK. **No** projects/tasks/Kanban/Decision Vault/AI/connected-apps (Phase 4+ untouched).

### Work completed

- **Verified the real SDK surface** from official docs before coding (no invented APIs): server SDK
  `@nexconn/server-sdk` (apps/api only) + client `@rongcloud/imlib-next` / `@rongcloud/engine`
  (desktop renderer). Architecture decision recorded in `ADR-0004` + `docs/architecture/nexconn-integration.md`.
- **Data layer** — additive, non-destructive migration `20261104015557_add_nexconn_communication`
  adding `NexconnUserMapping` / `WorkspaceConversation` / `ConversationParticipant` /
  `NexconnWebhookEvent` (FKs, unique constraints, indexes). **Message bodies are never stored** —
  Nexconn owns the stream; Postgres keeps only identity mapping, conversation metadata and a bounded
  callback audit for workspace isolation.
- **Backend chat module** (`apps/api/src/modules/chat`) — provider abstraction (`ChatProvider` +
  Nexconn impl + in-memory test double), token service (deterministic `bt-<userId>` external ids,
  short-lived user-scoped tokens, App Secret never returned), conversation service (GROUP + DIRECT,
  provider create/join/leave mirroring), webhook service (RongCloud `SHA1(secret+nonce+timestamp)`
  verification, replay window, constant-time compare, idempotent record). Versioned `/api/v1` routes
  under `/workspaces/:workspaceId`, `authenticate` + `requireWorkspaceRole('MEMBER')` on every route,
  Zod at the edge, `chatLimiter`, centralized provider-error mapping, unauthenticated `/webhooks/nexconn`.
- **Electron** — main mints the client token + does conversation CRUD over validated, sender-checked
  IPC (`reqId` guards path-interpolated ids; `IpcOutcome` envelope); the trusted main never forwards the
  App Secret to the renderer. The sandboxed renderer drives Web IMLib **directly** for
  send/history/typing/unread/live-events (`lib/chat-client.ts` — the ONLY module importing the client SDK).
- **Renderer (Impeccable, Operate mode)** — one new nav entry (**Messages**) opening a full-bleed,
  workspace-scoped two-pane surface: `ConversationList` · `ConversationView` (header, paged history,
  live stream, day dividers, composer, typing) · `ConversationDetailsDialog` (participants + membership)
  · `NewConversationDialog` (DIRECT/GROUP). `useChatRuntime` owns one connection + subscription per
  workspace; workspace switch remounts the scope; logout tears down the Nexconn session. Honest
  loading/empty/error states; **no fabricated conversations, messages, presence or receipts**.

### Deviations / decisions under fire

- **Presence & read receipts deliberately omitted** — this Web SDK build does not surface them in a
  dependable way, and §10 forbids misleading status, so they are NOT faked; only **typing**
  (`Events.TYPING_STATUS`, both directions) and real **unread** counts are shown.
- Live conversation routing standardized to `${ConversationType}:${targetId}` so live / history / send
  agree on one key (DIRECT peer resolved by `externalId !== myExternalId`).
- Unconfigured provider **fails closed** (503 → honest "Chat is currently unavailable"), never a mock
  thread; list metadata still loads through the API.
- Desktop renderer tests mock the transport (Web IMLib cannot run in jsdom) and set
  `asyncUtilTimeout: 8000` — the default 1s was flaky purely from CPU contention when the full monorepo
  suite runs the API integration suite alongside (a scheduling artifact, not a logic bug).

### Validation executed & results (all run)

| Check      | Command                 | Result                                                 |
| ---------- | ----------------------- | ------------------------------------------------------ |
| Migrations | `prisma migrate status` | ✅ 2 migrations; DB schema up to date                  |
| Typecheck  | `pnpm -r typecheck`     | ✅ shared + api + desktop                              |
| Lint       | `pnpm lint`             | ✅ 0 problems                                          |
| Format     | `pnpm format:check`     | ✅ all Prettier-clean                                  |
| Tests      | `pnpm -r test`          | ✅ **78** backend (6 files) + **20** desktop (3 files) |
| Build      | `pnpm -r build`         | ✅ api tsc→dist; desktop main/preload/renderer bundle  |

Phase 2 remains intact (all 49 + 14 prior tests still pass, now subsumed in the totals).

### Known issues / remaining work

- **Live two-account Nexconn verification is PENDING** — needs the App Key / App Secret + a second
  test account. Mocked tests prove BuildTogether's logic but are **never** claimed as proof the live
  provider works (§11/§12/§16).
- Renderer production bundle is ~2 MB (the Web IMLib SDK); a code-split/`manualChunks` pass is a
  reasonable future optimization, not a correctness issue.
- `@rongcloud/engine` emits a benign `path` externalization warning during the browser build (the SDK
  guards it); bundle builds and runs.

### Out-of-scope confirmation (Phase 3 exclusions honored)

No projects, project channels, tasks, Kanban, conversation→task, Decision Vault, Team Pulse, AI,
connected apps (GitHub/Figma/Notion), analytics, payments or marketing were started. **No Phase 4
features begun.**

**Phase 3 status: COMPLETE (mocked-verified); live-provider verification pending credentials.**

---

## Phase 2 — Identity, Workspaces & Team Management

**Date:** 2026-11-03 · **Status:** Complete (see acceptance in the phase report) · **Scope:**
the first genuinely functional phase — real identity, sessions, workspaces, RBAC and
team management across API + Electron. **No** messaging/projects/tasks/AI.

### Work completed

- **Auth decision** — self-managed authentication recorded in `ADR-0003` (managed providers,
  stateless JWT, and renderer-consumed cookies compared and rejected); `ADR-0001` amended with
  the Phase 2 identity/driver dependencies.
- **Data layer** — Prisma schema for `User`/`Session`/`Workspace`/`WorkspaceMembership`/
  `WorkspaceInvitation`; committed migration `20261103175232_init_identity_workspaces` applied
  against Docker PG `bt-postgres` (additive, non-destructive); client built on the Prisma 7
  `@prisma/adapter-pg` driver adapter.
- **API surface** — layered controller/service/repository with infra (env validation, prisma
  singleton, logger, `AppError`, zod `validate`, envelope, `express-rate-limit`, auth +
  `workspaceScope` + `requireWorkspaceRole` middleware). Versioned `/api/v1` endpoints for
  auth (register/login/refresh/logout/me/change-password), users, workspaces, members and
  invitations — each validated, authenticated, authorized and enveloped.
- **Security (ADR-0003)** — Argon2id passwords; server-managed **opaque hashed sessions** with
  rotation + family reuse detection and immediate revocation; no auth cookie (CSRF N/A);
  generic auth errors + throttling for anti-enumeration; workspace isolation is server-derived
  (never a trusted client `workspaceId`); RBAC invariants (always an owner; owner leaves only
  via transfer; no self-escalation). Secure invitations: hashed, expiring, single-use, bound to
  email + role; dev email transport clearly labelled (no faked send).
- **Electron integration** — the **main** process owns the session (`session-store.ts` via
  `safeStorage`, memory-only fallback when encryption is unavailable) and is the sole
  authenticated API client (`api-client.ts`: bearer + transparent refresh-once on 401);
  `ipc.ts` exposes named, sender- and argument-validated handlers returning an `IpcOutcome`
  envelope; `preload` publishes the full typed `window.bt` bridge. **Tokens never reach the
  renderer** (it gets `AuthSessionView` only). Phase 1 security posture preserved.
- **Renderer (Impeccable, Operate mode)** — `AuthProvider` session gate; welcome/sign-in/
  sign-up; first-workspace onboarding; workspace switcher; team screen (members roster +
  server-authoritative role management, invite, invitations panel); workspace settings;
  profile & security (change password); invitation acceptance. Reuses existing tokens and
  primitives; honest loading/empty/error states; `lib/rbac.ts` is visibility-only.
- **Tests** — 49 backend integration tests (auth lifecycle, rotation + reuse detection,
  hashing, no-enumeration, workspace CRUD + isolation, invitations, security/rate-limit) and
  14 desktop renderer/pure tests (sign-in gate, authenticated shell, RBAC, token parsing).

### Deviations / decisions under fire

- Integration files run with `fileParallelism: false` — they share one test database each
  resets; serializing avoids cross-file wipe races (documented, not a flake).
- A plain MEMBER's self-removal (leave) was corrected to be allowed (route lowered to MEMBER;
  the service still requires ADMIN+ to remove others) — surfaced by a failing test.
- `@node-rs/argon2` (prebuilt N-API) chosen over node-gyp `argon2` for Windows install; the
  `Algorithm` const enum isn't importable under `verbatimModuleSyntax`, so Argon2id (library
  default) is used directly.

### Docs updated

ADR-0003 (new) + ADR-0001 (amended); phase-roadmap; database/backend/desktop architecture;
security-guidelines; environment-setup (+ `.env.example`); testing-strategy; user-roles;
feature-map; product-requirements.

---

## Phase 1 — Build Together Desktop Product Foundation

**Date:** 2026-11-03 · **Status:** Complete (see acceptance below) · **Scope:** desktop-first
architecture, app shell & design foundation — **no product features**.

### Repo & environment at start

- Phase 0 was committed (`3c43369`) on `main`/`origin/main`; working tree inspected and
  preserved before changes (no user work overwritten).
- Node v24 · pnpm 11.8.0 · Windows; API dev port **4000** (`int('PORT', 4000)`).

### Work completed

- **Framework decision** — Electron chosen; recorded in `ADR-0002` (Tauri/browser-only/
  Neutralino compared). `ADR-0001` amended with the desktop-runtime row.
- **Monorepo restructure** — created `apps/desktop` (`electron/main`, `electron/preload`,
  React `src` renderer); **retired `apps/web`** by migrating its React app into the renderer
  (no duplicate frontends). `apps/api` + `packages/shared` preserved.
- **Electron architecture + security** — main/preload/renderer boundary; `contextIsolation`
  on, `nodeIntegration` off, `sandbox: true`; restrictive CSP via `onHeadersReceived`; a
  privileged custom `app://bundle` protocol (no `file://`); deny-all permission handler;
  navigation/new-window guards; **every IPC sender origin-validated**; typed preload bridge
  (`window.bt`) exposing only allowlisted methods. Shared contract in
  `packages/shared/src/desktop.ts`.
- **Environment-aware config** — API base resolved in main: `BT_API_BASE_URL` → dev
  `http://localhost:4000` → packaged `https://api.buildtogether.app`; never a hardcoded
  localhost prod URL. Backend keeps its health endpoint; renderer→remote-API documented.
- **Design token foundation** — Tailwind v4 `@theme` tokens (canvas/surface/border/text,
  accent, status colors, type/spacing/radius scales, motion, elevation utilities).
- **Foundational components + app shell** — Button/IconButton, Input, Tooltip, Avatar,
  Separator, Dialog, Dropdown, NavItem, EmptyState; `AppShell` (sidebar with logo placeholder,
  disabled workspace-switcher, project-centric nav: Home · My Work · Projects · Connected
  Apps · Decision Vault · Team · Settings; header with global-search entry, quick-create,
  live API-status indicator, account menu). Honest empty states only — **no fake data**.
- **Tooling wired** — root ESLint flat config (desktop browser+node globals, ignores
  `out/`, `dist-electron/`, `release/`), root scripts `desktop:dev|build|package`, Prettier
  ignores, `pnpm-workspace.yaml` allow-builds for `electron` + `electron-winstaller`,
  `.gitignore` for Electron outputs.
- **Docs updated** — new `architecture/desktop-architecture.md`; refreshed system-overview,
  frontend/backend architecture, security-guidelines, environment-setup, ADR-0001,
  phase-roadmap (reconciled: Phase 1 = desktop foundation; identity/workspaces → Phase 2);
  CLAUDE/PRODUCT/DESIGN reflect desktop-first.

### Dependencies added (justified, stable only)

`electron@45.2.1`, `electron-vite@6.0.0` (peer vite `^6‖^7‖^8` — compatible with Vite 8.3.5),
`electron-builder@26.18.0` (config only, not run). No new renderer runtime libs beyond the
Phase 0 set (React/Motion/Lucide/Tailwind reused).

### Compatibility adjustments (verified, not assumed)

1. `electron-vite@6` requires entry under `build.lib.entry` (top-level `main.entry` rejected).
2. `apps/desktop` has **no** `"type":"module"` — sandboxed preload must be CommonJS; renderer
   is a separate static ESM build.
3. `externalizeDepsPlugin({ exclude: ['@buildtogether/shared'] })` — bundle the source-only
   shared package into main/preload (else runtime `ERR_MODULE_NOT_FOUND`).
4. Electron binary downloaded post-install (`node node_modules/electron/install.js`).
5. Vitest (no globals) needs explicit `afterEach(cleanup)`; `@testing-library/react`
   assertions switched to role-based queries.

### Validation executed & results (all run, none assumed)

| Check                      | Command / method                               | Result                                                                                              |
| -------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Dependency install         | `pnpm install`                                 | ✅ up to date; 4 workspace projects                                                                 |
| Typecheck                  | `pnpm typecheck`                               | ✅ shared + api + desktop                                                                           |
| Desktop build              | `pnpm desktop:build`                           | ✅ main 12.16 kB · preload 0.92 kB · renderer js 609.85 kB                                          |
| Backend build              | `pnpm --filter api build`                      | ✅ tsc emit → dist (exit 0)                                                                         |
| Tests                      | `pnpm test`                                    | ✅ api 2 passed · desktop 2 passed                                                                  |
| Lint                       | `pnpm lint`                                    | ✅ 0 problems (exit 0)                                                                              |
| Format                     | `pnpm format:check`                            | ✅ all Prettier-clean                                                                               |
| **Dev launch (Electron)**  | `pnpm dev` + `BT_SMOKE=1`                      | ✅ `SMOKE_OK` url `http://localhost:5173/`, IPC config `http://localhost:4000`, win32/x64           |
| **Prod launch (Electron)** | `electron apps/desktop` `BT_PROD=1 BT_SMOKE=1` | ✅ `SMOKE_OK` url `app://bundle/index.html`, IPC config `https://api.buildtogether.app`, clean exit |
| Supply chain               | `pnpm audit`                                   | ⚠️ 1 moderate (`minimatch` via ESLint **dev** toolchain, patched ≥11.0.1) — see below               |

The dev and production paths were **actually launched** (window created, renderer loaded,
secure typed preload/IPC bridge exercised with sender-origin validation on both `http://
localhost:5173` and `app://bundle`, clean shutdown) — not merely built.

### Known issues / remaining work

- **Packaging not executed** — `electron-builder` is configured but no installer was built
  or run, so packaged-installer runtime (incl. code signing / auto-update) is untested; only
  the built-bundle production path was smoke-launched.
- **Audit advisory** — `minimatch` (moderate) is a transitive **devDependency** under the
  ESLint toolchain, not a shipped runtime dependency; resolve via an eslint/minimatch bump
  when a patched release lands.
- GPU-proxy warnings during headless smoke runs are benign (no physical display).
- macOS behaviour implemented via standard roles but validated on Windows only.

### Out-of-scope confirmation (Phase 1 exclusions honored)

No login/registration, workspace creation, invitations, user management, Nexconn/messaging,
message history, tasks, Kanban, Figma/GitHub/ChatGPT integrations, Decision Vault, AI, Team
Pulse, analytics, notifications or payments were implemented. **No Phase 2 features started.**

**Phase 1 status: READY FOR PHASE 2.**

---

## Phase 0 — Engineering Environment, Agent Skills & Project Intelligence

**Date:** 2026-11-03 · **Status:** Complete (see acceptance below) · **Scope:** environment &
readiness only — **no product features**.

### Repo & environment at start

- Repository was empty except `.git` (branch `main`, **no commits yet**). Git identity
  (`mano45-sudo`) and remote `origin` were already configured — preserved, not rewritten.
- Node v24.13.1 · pnpm 11.8.0 · npm 11.13.0 · git 2.54.0 (Windows).

### Work completed

- **Inspection** of repo + toolchain before changes; adapted the empty repo (nothing
  destroyed).
- **Impeccable** installed at project scope for the `claude` provider via
  `npx impeccable install --providers=claude --scope=project`: skills + 4 agents + engine
  v0.1.18 (windows-x64) + hooks (in `.claude/settings.local.json`). Design context
  bootstrapped via `impeccable context` (reported `NO_PRODUCT_MD`, `PRODUCT_INIT_REQUIRED`).
- **7 project skills** authored under `.claude/skills/`: backend-engineering,
  database-engineering, nexconn-integration, frontend-engineering, testing-qa,
  security-review, phase-execution — each with YAML frontmatter and actionable rules.
- **Instruction files:** `CLAUDE.md` (canonical) + `AGENTS.md` (pointer, non-contradicting);
  shared `.claude/settings.json`.
- **Docs:** `PRODUCT.md` (Impeccable product schema), `DESIGN.md`, and the full
  `docs/` tree (architecture ×5, engineering ×4, product ×3, decisions ×1, development ×2).
- **Monorepo:** pnpm workspaces — `apps/web`, `apps/api`, `packages/shared`, `e2e/`;
  compiling scaffolds only (React/Vite/Tailwind placeholder page; Express app factory +
  health route; shared API-envelope contracts; model-free Prisma schema).
- **Env & config:** `.env.example` for web + api (placeholders only, documented), root
  ESLint flat config, Prettier, base `tsconfig`, Vitest configs, Playwright config,
  `.gitignore` (blocks `node_modules`, build outputs, `.env*`, `.claude/settings.local.json`,
  local tool state).
- **Git standards** documented (Conventional Commits, branch naming, no secrets/artifacts) in
  `CLAUDE.md §11` + `AGENTS.md`.

### Dependencies installed (justified, stable only)

Runtime: react/react-dom 19.3.1, motion 14.9.0, lucide-react 1.67.0, express 5.3.0,
@prisma/client 7.10.1. Dev/tooling: vite 8.3.5, @vitejs/plugin-react 6.2.1,
tailwindcss + @tailwindcss/vite 4.3.4, typescript **6.0.3**, tsx 4.23.15, prisma 7.10.1,
vitest 5.1.0, @playwright/test 1.64.1, eslint 10.14.0, typescript-eslint 8.72.1,
@eslint/js 10.0.1, globals 17.14.0, eslint-config-prettier 10.1.8, prettier 3.9.10,
@types/express 5.0.6, @types/node 26.6.6, @types/react(-dom) 19.3.0, jsdom 30.1.3,
@testing-library/react 16.3.3, @testing-library/jest-dom 7.0.1. (pnpm build scripts allowed
for esbuild + prisma/@prisma/engines only.)

### Compatibility adjustments (verified, not assumed)

1. **TypeScript 7.0.2 → 6.0.3.** `typescript-eslint@8.72.1` hard-errors on TS 7.0 (support
   tracked for ≥7.1). Pinned stable 6.x so linting runs. See ADR-0001.
2. **Prisma datasource `url` removed from `schema.prisma`.** Prisma 7 rejects it (P1012);
   URL moves to `prisma.config.ts` (added in the DB phase). validate + generate pass.
3. `prisma@latest` was `8.0.0-rc` → used stable `7.10.1`.

### Validation executed & results (all run, none assumed)

| Check              | Command                        | Result                                           |
| ------------------ | ------------------------------ | ------------------------------------------------ |
| Dependency install | `pnpm install`                 | ✅ 471 pkgs, lockfile passed supply-chain        |
| Prisma compat      | `prisma validate` / `generate` | ✅ valid; client v7.10.1 generated               |
| Typecheck          | `pnpm typecheck`               | ✅ shared + web + api                            |
| Frontend build     | `pnpm --filter web build`      | ✅ Vite built (2049 modules)                     |
| Backend build      | `pnpm --filter api build`      | ✅ tsc emit → dist                               |
| Tests              | `pnpm test`                    | ✅ api 2 passed, web 1 passed (component render) |
| Lint               | `pnpm lint`                    | ✅ 0 problems                                    |
| Format             | `pnpm format:check`            | ✅ all files Prettier-clean                      |

### Known issues / remaining work

- Playwright browsers not installed (deliberate — E2E begins in a UI phase):
  `pnpm exec playwright install chromium`.
- No `prisma.config.ts` / real datasource URL / models until the database phase.
- Nexconn SDK specifics intentionally not integrated; official docs must be consulted in the
  integration phase (no methods invented).
- **Initial setup commit not created** (awaiting explicit go-ahead; git is configured and a
  first commit would not rewrite history). Suggested: `git add -A && git commit -m "chore: phase 0 engineering environment"`.

### Out-of-scope confirmation

No login/registration, workspaces, chat, Nexconn integration, tasks, Kanban, Decision Vault,
AI, dashboards, or fake UI screens were implemented. **No future-phase features were added.**

**Phase 0 status: READY FOR PHASE 1.**
