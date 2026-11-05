# Implementation Log

Running record of completed phases. Newest first. Full detail for a phase lives in its
completion report; this log is the durable summary.

---

## Phase 7 — Execution Intelligence Engine _(deterministic foundation)_

**Date:** 2026-11-05 · **Status:** deterministic backend foundation complete & verified (all gates
green); AI seam + notification wiring + desktop surfaces **deferred, pending authorization** ·
**Scope:** contextual, explainable intelligence layered on the existing project / task / conversation /
Decision-Vault infrastructure — **not** a generic AI chatbot. Ships explainable project health, structured
blocker detection, deadline & risk intelligence, next-best-actions, decision-revision impact, and personal
execution intelligence as **pure, deterministic** signals that work with **zero AI** present. **No
future-phase features were begun**; no vendor dependency committed.

### Work completed

- **Data layer** — one additive, **non-destructive** migration `20261105042725_add_execution_intelligence`
  (7 migrations total, `prisma migrate status` up-to-date). It adds **only** the two genuinely durable
  things: `IntelligenceDismissal` (a user's `DISMISSED`/`RESOLVED` state on a computed signal, unique on
  `(workspaceId, userId, kind, dedupKey)`) and a first-class workspace-scoped `Notification`
  (`dedup` unique on `(workspaceId, userId, dedupKey)`, inbox indexes), plus `InsightKind`/
  `DismissalState`/`NotificationKind`/`NotificationEntityType` enums. **Nothing derived is stored** —
  health/blockers/risks/recommendations/impacts are computed on read so a snapshot can never drift
  (ADR-0005). No prior-phase data touched.
- **Deterministic rules engine** (`apps/api/src/services/intelligence/*`) — total **pure functions** over
  already-authorized signal rows plus an explicit `now` (no Prisma, no Express, no ambient clock), so every
  output is reproducible and unit-testable: `common.ts` (every threshold lives once), `health.ts`
  (`computeMetrics` → `computeHealth`, state = **worst severity** among documented factors → `AT_RISK` /
  `NEEDS_ATTENTION` / `ON_TRACK`, never an arbitrary score), `blockers.ts` (structured sources only —
  unfinished/overdue prerequisite, awaiting a decision, a decision needing review; **reuses** the derived
  unfinished-prerequisite relationship, never mutates a task; the brief's "unresolved clarification" source
  is **honestly omitted** as no such entity exists), `risk.ts` (LOW/MEDIUM/HIGH, each carrying
  WHAT/WHY/EVIDENCE/ACTION), `recommendations.ts` (next-best-actions derived from an already-detected
  signal, deduplicated + priority-sorted, never auto-executed), `impacts.ts` (built entirely on the Phase 6
  supersede chain — a `SUPERSEDED` decision's linked **live** tasks may need review; deleted tasks skipped,
  never invented; no auto-rewrite), `personal.ts` (buckets the caller's own visible work —
  `overdue`/`upcoming`/`blocked`/`awaitingMyReview`).
- **Module** (layered route→middleware→controller→service→repo, **only the repo touches Prisma**) —
  `intelligence.service.ts` is the **sole orchestrator**; `intelligence.repo.ts` the only Prisma layer;
  thin `intelligence.controller.ts`; `intelligence.routes.ts` mounted with `mergeParams` at
  `/api/v1/workspaces/:workspaceId/intelligence` **after** `authenticate` + `requireWorkspaceRole('MEMBER')`
  - a dedicated `intelligenceLimiter` (`INTELLIGENCE_RATE_LIMIT` / 5 min). Endpoints:
    `GET /projects/:projectId/{overview,health,blockers,risks,recommendations,decision-impacts}`,
    `GET /personal`, `POST /dismissals`, `DELETE /dismissals`. zod at the edge
    (`intelligence.schemas.ts`: `deadlineWindowDays` 1–90 via `validateQuery`; dismiss/undismiss via
    `validate`). `{ data, error, meta }` envelope throughout.
- **Authorization reuse (no parallel services)** — a project read is gated through the **existing**
  `project.service.getProject` (a foreign or PRIVATE project the caller cannot see → **404**, a non-member
  → **403** via the mount); personal intelligence reuses the already visibility-filtered
  `task.service.listMyTasks`. Dismissing hides an item from **that user's** list only — health is never
  dismissal-filtered and never rewritten.
- **Shared contracts** — `packages/shared/src/intelligence.ts` (health/blocker/risk/recommendation/
  decision-impact/personal DTOs + dismissal inputs), exported from the barrel.

### Gates (real infrastructure)

Typecheck **0**, production build `tsc -p tsconfig.build.json` **0**, eslint **clean**,
prettier **0**, full vitest suite **182 tests / 11 files pass** (13 new engine unit tests +
6 new HTTP integration tests against real PostgreSQL, covering health, blocker/risk/recommendation
detection, decision-revision impact over the real Phase 6 supersede chain, workspace/project isolation,
and dismissal dedup).

### Honest gaps (deferred by authorized scope — not oversights)

- **AI context layer (§4)** — deferred provider-independent seam (fails closed, no vendor dependency
  committed); the product works fully with no model configured. `.env.example` carries inert
  `AI_PROVIDER`/`AI_API_KEY` placeholders.
- **Notifications** — the model + migration ship now; the producer/consumer endpoints that emit and
  serve them land in a later increment.
- **Conversation-derived blocker detection** — needs the deferred AI seam; PostgreSQL stores no message
  bodies (Nexconn owns them), so it is out of this deterministic increment.
- **Desktop surfaces (§8)** — the `/intelligence` renderer UI is deferred to the next authorized increment.

---

## Phase 6 — Decision Vault

**Date:** 2026-11-05 · **Status:** Complete & verified (all gates green) · **Scope:** the project
**decision layer** — workspace/project-scoped, first-class `Decision` records with a closed
lifecycle state machine, categorisation, an accountable owner (separate from authorship), considered
alternatives, cited references (incl. decision→decision), participants, a typed history timeline and
a discussion thread, across API + Electron + renderer. **Deliberately excluded** (Phase 6 brief):
auto-deriving decisions from chat messages, AI decision suggestions, execution intelligence,
conversation/task **deep-links** from the vault (the shell has no deep-link route yet — see Known
issues), Team Pulse, Connected Apps, and every later phase. **No future-phase features were begun.**

### Work completed

- **Data layer** — two additive, **non-destructive** migrations. `20261104093318_add_decision_vault`
  creates `Decision`, `DecisionAlternative`, `DecisionReference`, `DecisionParticipant`,
  `DecisionHistory`, `DecisionComment` (+ `DecisionStatus`/`DecisionSource`/`DecisionReferenceType`/
  `DecisionHistoryType` enums, workspace/project/status indexes, FKs). `20261104104500_decision_vault_lifecycle_and_ownership`
  aligns the schema to the brief **in place**: renames the lifecycle enum values
  (`IN_DISCUSSION→PROPOSED`, `FINALIZED→APPROVED`), adds `REJECTED`; adds a `DECISION` reference type
  and an `OWNER_CHANGED`/`REJECTED` history event; introduces `DecisionCategory`
  (`PRODUCT/DESIGN/ENGINEERING/BUSINESS/OPERATIONS/GENERAL`, default `GENERAL`); adds `summary`,
  `category`, `rejectedAt`; **backfills `ownerId` from `createdById` before it becomes `NOT NULL`**
  (authorship never moves, ownership can — kept deliberately separate); extends alternatives with
  `advantages`/`disadvantages`/`rejectionReason`; adds a workspace+category and workspace+owner index
  and a `Restrict` owner FK. No decision data is dropped; no prior-phase data touched.
- **Backend** (`apps/api`, layered route→controller→service→repository, only repos touch Prisma) —
  `/api/v1/workspaces/:workspaceId/decisions` mounted AFTER `authenticate` +
  `requireWorkspaceRole('MEMBER')` with `mergeParams`, so every `:decisionId` is resolved against the
  PATH workspace (**cross-workspace id → 404**, no existence leak). Endpoints: list + create
  (collection), get/patch/delete (`/:decisionId`), **dedicated lifecycle** routes
  (`/approve` `/reject` `/supersede` `/archive` `/restore`) so history stays typed and PATCH cannot
  reach finalising states, participant add/remove, and paginated **history** + **comments** feeds.
  Zod at the edge (`decisions.schemas.ts`): a single-link refine, a `createSourceSchema`
  (`MEETING/MANUAL` only when linkless), a `patchableStatusSchema` (`DRAFT↔PROPOSED`), and a
  reference refine (`TASK/CONVERSATION/DECISION` need `entityId`; `DOCUMENT/LINK/FILE` need an
  **http(s)** `url`). All responses use the `{data,error,meta}` envelope; list + feeds use **keyset
  cursor** pagination. Every multi-record write (decision + alternatives + references + participants
  - history) runs inside one **`$transaction`**.
- **Server-side lifecycle & access rules (the security boundary — the UI only mirrors it):** VIEW
  gates on `projectService.getProject` visibility (a denied PRIVATE-project read surfaces **404**);
  **CREATE** needs context visibility, and every link is re-validated to live in **this** workspace
  (`DECISION_MULTI_LINK`, `DECISION_LINK_INVALID`). The **manager** set (edit/propose/approve/reject/
  supersede/archive/restore/delete/participants/owner-change) is exactly `task.service`'s rule:
  workspace OWNER/ADMIN, the creator, the owner, or the linked project's manager — else **403
  `INSUFFICIENT_ROLE`**. The lifecycle is a **closed state machine** (`STATUS_TRANSITIONS`);
  an out-of-matrix move → **409 `INVALID_TRANSITION`**; **APPROVE requires a non-empty decision
  statement** (`DECISION_STATEMENT_REQUIRED`); **SUPERSEDED/ARCHIVED lock content** (409
  `DECISION_LOCKED`); restore returns the `preArchiveStatus`. `≤1 chosen alternative` is
  server-enforced (`TOO_MANY_CHOSEN`); owners/participants must be current members
  (`PARTICIPANT_NOT_MEMBER`); the **creator cannot be removed** from the roster
  (`CREATOR_REQUIRED`); a decision can't supersede itself or a locked target (`SELF_SUPERSEDE`,
  `SUPERSEDE_TARGET_LOCKED`). References resolve their linked entity's live title server-side
  (`resolvedLabel`), reading as `null` across the workspace boundary.
- **Shared contracts** — `packages/shared/src/decisions.ts` (`DecisionView`, `DecisionDetailView`,
  `DecisionActorView`/`ParticipantView`/`AlternativeView`/`ReferenceView`/`HistoryView`/`CommentView`,
  `Create/Update/Supersede/Participant/Comment` inputs, `DecisionListQuery` + status/category/source/
  reference/history/sort unions) exported from the barrel; both sides of the Electron boundary
  compile against one source of truth.
- **Electron integration** — decisions flow through the existing hardened bridge, no new privilege:
  `shared/desktop.ts` adds a `DesktopBridge.decisions` namespace + `decisions:*` IPC channels; the
  main process registers sender- and argument-validated handlers that allowlist the payload/query;
  `main/api-client.ts` is the sole authenticated caller; `preload` re-exports the typed methods.
  **Tokens never reach the renderer** (`lib/data.ts` unwraps `IpcOutcome`→`BridgeError`).
- **Renderer (Impeccable, Operate mode)** — a **Decisions** nav entry + workspace `DecisionsScreen`
  (server-driven search/category filter + Grouped/List views, sections ordered by lifecycle), and a
  **Decisions** tab added to the existing `ProjectWorkspace` (Overview · Tasks · Conversations ·
  **Decisions** · Members/Settings) reusing the same `DecisionRow`/`DecisionDetail` via a
  `ProjectDecisionsPanel` scoped by `projectId`. `DecisionDetail` is the full surface: inline-editable
  content (saved on blur), a lifecycle bar (Propose / Withdraw / Approve — gated on the statement /
  Reject / Archive / Restore / Supersede-with-candidate-picker), alternatives with REPLACE semantics
  (radio ≤1 chosen), references, participants (creator immovable), a comments thread and the history
  timeline. `CreateDecisionDialog` is minimal (title required, everything else optional). The whole
  feature mirrors the established **monochrome** language from `DESIGN.md` — horizontal divided rows,
  status colour reserved for meaning and always labelled, real empty/loading/error states. **No mock
  decisions, no hardcoded history, no placeholder screens** anywhere.

### Deviations / decisions under fire

- **Brief alignment mid-flight** — the initial vault migration used `IN_DISCUSSION`/`FINALIZED`;
  the product brief specifies `PROPOSED`/`APPROVED`/`REJECTED` plus category + a separate accountable
  owner. This was corrected by the second, non-destructive migration and propagated through
  shared → API → bridge → renderer (typecheck + full suite re-greened), rather than left drifted.
- **Lifecycle via dedicated endpoints, not PATCH** — finalising moves (approve/reject/supersede/
  archive/restore) get their own routes so each writes a correctly-typed history row; PATCH is
  schema-restricted to `DRAFT↔PROPOSED` only.
- **Context links render, but don't yet deep-link** — the shell has no deep-link route to a specific
  project/conversation, so the vault shows those context links as honest **read-only labels**; only
  decision→decision navigation (supersede target, `DECISION` reference) is clickable. No dead
  affordances were added.
- **Decision realtime is honestly deferred** — the Phase 3 Nexconn surface exposes no domain-event
  broadcast for decision changes; rather than build a second channel or fake push (§8), the vault is
  fully API-backed (every mutation persists then re-fetches; `mutate→reload`, the same validated
  pattern as projects/tasks).

### Validation executed & results (all run in-session, none assumed)

| Check      | Command                 | Result                                                       |
| ---------- | ----------------------- | ------------------------------------------------------------ |
| Migrations | `prisma migrate status` | ✅ 6 migrations; DB schema up to date                        |
| Typecheck  | `pnpm -r typecheck`     | ✅ shared + api + desktop                                    |
| Lint       | `pnpm lint`             | ✅ 0 problems (exit 0)                                       |
| Format     | `pnpm format:check`     | ✅ all Prettier-clean                                        |
| Tests      | `pnpm -r test`          | ✅ **163** backend (9 files) + **36** desktop (5 files)      |
| Build      | `pnpm -r build`         | ✅ api tsc→dist; desktop electron-vite main/preload/renderer |

- **New backend coverage** — `decisions.test.ts` adds **35** integration tests against real PG:
  create defaults (`DRAFT`/`GENERAL`/`MANUAL`, owner=creator, creator auto-participant), `source`
  derivation from a project link, explicit `PROPOSED`+member-owner create, empty-title + non-member
  owner/participant rejection, single-link enforcement, PRIVATE-project link → 404, ≤1 chosen
  alternative (`TOO_MANY_CHOSEN`), reference shape/target legality (incl. `javascript:` url barred),
  list filters (status/category/project/owner/participant/search) + keyset cursor, PATCH edits +
  alternatives REPLACE, `DRAFT↔PROPOSED` allowed / finalising states barred via PATCH, approve-with-
  statement + `DECISION_STATEMENT_REQUIRED`, reject-keeps-readable, illegal transition (`409`),
  supersede + `SELF_SUPERSEDE` + `supersededByTitle`, content lock on archive (`DECISION_LOCKED`),
  archive→restore to `preArchiveStatus`, participant add/remove + `CREATOR_REQUIRED`, a typed history
  timeline, the comments feed with author/editor deletion, manager delete, RBAC (fellow MEMBER 403 /
  ADMIN+OWNER manage), non-member `403 NOT_A_MEMBER`, unauthenticated `401`, cross-workspace foreign
  id → `404`, and PRIVATE-project decision hidden → `404`.
- **New desktop coverage** — `rbac.test.ts` adds **3** `canManageDecision` cases (OWNER/ADMIN manage
  all; a plain MEMBER only what they created/own; a project-manager's decision via the linked
  project), keeping the client mirror honest.
- Phase 2–5 remain green (auth + workspaces + members + invitations + chat + webhook + projects +
  tasks), now subsumed in the **163**-test backend total; desktop is **36** across 5 files.

### Known issues / remaining work

- **Decision realtime is genuinely deferred** — it needs a Nexconn domain-event broadcast that does
  not exist yet; the vault is fully API-backed with `mutate→reload`, never a faked push. Wiring real
  decision events belongs to a later, authorized phase once the provider capability is validated.
- **Context deep-linking** — decision→project/conversation rows are read-only labels; making them
  navigable requires a shell deep-link route (a small, isolated follow-up, deliberately not faked
  here).

### Out-of-scope confirmation (Phase 6 exclusions honored)

- No auto-derived decisions from messages, no AI suggestions/recommendations, no execution
  intelligence, no Team Pulse, no Connected Apps, no billing/reporting/Gantt. Every Phase 6
  affordance in the UI maps to a real, tested endpoint; nothing was stubbed for visual completeness.

---

## Phase 5 — Task Management, Ownership & Dependencies

**Date:** 2026-11-04 · **Status:** Complete & verified (all gates green) · **Scope:** the project
**execution layer** — workspace/project-scoped `Task`s with owners, status, priority, due dates,
cycle-safe dependencies and an activity timeline, across API + Electron + renderer. **Deliberately
excluded** (Phase 5 brief §10): conversation→task, Decision Vault, Team Pulse, AI task gen/
recommendations, Execution Intelligence, auto-ownership, predictive risk, Connected Apps, time
tracking, billing, advanced reporting, Gantt, subtask hierarchies, recurring tasks. **No
future-phase features were begun.**

### Work completed

- **Data layer** — additive, non-destructive migration `20261104073845_add_task_management` (three
  `CREATE`s + enums/indexes/FKs only, no `DROP`; Phase 2/3/4 data preserved). `Task` carries
  `id, workspaceId, projectId, title, description, status, priority, createdById, assigneeId,
startDate, dueDate, completedAt, createdAt, updatedAt`; enums `TaskStatus`
  (`TODO/IN_PROGRESS/IN_REVIEW/DONE`), `TaskPriority` (`LOW/MEDIUM/HIGH/URGENT`), `TaskActivityType`
  (9-event closed vocabulary). `TaskDependency` has **`@@unique([taskId, dependsOnTaskId])`** (no
  duplicate edges) + a `dependsOnTaskId` index; `TaskActivity` is workspace- **and** project-scoped.
  FKs: `workspace`/`project`/`Task→Task` edges and activity-task are `Cascade`; **`assignee` is
  `SetNull`** (a departing member never deletes owned work) while **`createdBy`/`actor` are
  `Restrict`** (accountability points at real users). Status indexes + a `dueDate` index back the
  list/My-Work queries.
- **Backend** (`apps/api`, layered route→controller→service→repository, only repos touch Prisma) —
  `/api/v1/workspaces/:workspaceId/…` task routes mounted AFTER `authenticate` +
  `requireWorkspaceRole('MEMBER')` with `mergeParams`, so every `:projectId`/`:taskId` is resolved
  against the PATH workspace (**cross-workspace id → 404**, no existence leak). Endpoints: list +
  create (`/projects/:projectId/tasks`), get/patch/delete (`/tasks/:taskId`), focused
  **assignee**/**status** patches, dependency get/add/delete, paginated **activity**, and a
  cross-project **assigned-to-me** aggregate (declared before `/tasks/:taskId`). Zod at the edge
  (`tasks.schemas.ts`) incl. a `nullableId` assignee and a coerced list query; all responses in the
  `{data,error,meta}` envelope; list + activity use **keyset cursor** pagination (`meta.cursor`).
  Every multi-record write (task+edges+activity, update+activity, assign+activity,
  add/remove-dependency+activity) runs inside one **`$transaction`**.
- **Server-side ownership & dependency rules (the security boundary — the UI only mirrors it):**
  VIEW ops gate on the existing `projectService.getProject` visibility rule (a denied PRIVATE read
  surfaces **404**, not 403 — existence never leaked); CREATE needs project visibility;
  content-update/delete/assign/dependency-mutation need **manage** (OWNER/ADMIN or project
  owner/creator); status change is allowed by a manager **or** the assignee/creator. Assignees are
  validated as **current workspace members** (`INVALID_ASSIGNEE`). Dependency legality: same project
  **and** workspace (`DEPENDENCY_OUT_OF_SCOPE`), no self-edge (`SELF_DEPENDENCY`), no duplicate
  (`DEPENDENCY_EXISTS` 409), and a **DFS cycle check** over the project graph (`CIRCULAR_DEPENDENCY`).
  `blocked` is **DERIVED** at read (≥1 non-DONE prerequisite) — never stored, and completing a
  prerequisite **never auto-moves** a dependent task (§7: dependency state ⟂ workflow status).
  Activity messages are pre-rendered server-side (closed vocabulary, locale-stable); `completedAt`
  is stamped on entering `DONE` and cleared on leaving it.
- **Shared contracts** — `packages/shared/src/tasks.ts` (`TaskView`, `TaskRef`, `TaskDependencyView`,
  `TaskDependencies`, `TaskActivityView`, `MyTaskView`, `Create/Update/Assign/ChangeStatus/AddDependency`
  inputs, `TaskListQuery` + status/priority/activity/sort unions) exported from the barrel; both
  sides of the Electron boundary compile against one source of truth.
- **Electron integration** — tasks flow through the existing hardened bridge, no new privilege:
  `shared/desktop.ts` adds a `DesktopBridge.tasks` namespace + twelve `tasks:*` IPC channels;
  `main/ipc.ts` registers sender- (`assertTrustedSender`) and argument-validated handlers (`reqId`
  for path-interpolated ids; `buildCreateTask`/`buildUpdateTask`/`buildTaskListQuery` allowlist the
  payload + query); `main/api-client.ts` is the sole authenticated caller; `preload` re-exports the
  typed methods. **Tokens never reach the renderer** (`lib/data.ts` unwraps `IpcOutcome`→`BridgeError`).
- **Renderer (Impeccable, Operate mode)** — a new **Tasks** tab added to the existing
  `ProjectWorkspace` (Overview · **Tasks** · Conversations · Members/Settings), preserving all Phase
  4 functionality. `TasksPanel` offers a compact **list** table (Task · Status · Priority · Assignee ·
  Due date) with search + status/priority/assignee filters + sorting, and a **Kanban** (four columns,
  **move buttons — not drag-and-drop —** that optimistically update then persist with **rollback +
  recovery feedback** on failure); the two views share one store so they stay consistent. `TaskDetail`
  is a focused panel (title, description, status, priority, assignee, due date, dependencies with
  blocked indicators + navigation, activity timeline); `CreateTaskDialog` is a quick-create (**title +
  project required**, everything else optional). `taskUtils.ts` centralizes monochrome status/priority
  tones + due-date/overdue formatting. A **My Work** nav entry + `MyWorkScreen` renders the real
  assigned-to-me aggregate grouped **Upcoming / In Progress / Overdue / Completed**, each row showing
  project/priority/due date, opening the task and updating status. **No mock tasks or hardcoded
  activity** anywhere.
- **Nexconn — honest deferral** — the Phase 3 integration exposes only identity, tokens and
  GROUP/DIRECT conversation membership; there is **no** validated domain-event broadcast for task
  changes. Rather than build a second realtime channel or fake push updates (§8), the app stays
  **reliably API-backed** (every mutation persists and re-fetches; optimistic UI with rollback) and
  the limitation is documented.

### Deviations / decisions under fire

- **Endpoint shape** — the brief suggested `/projects/:projectId/tasks` + `/tasks/:taskId`; §4
  explicitly allows adjusting to existing conventions, so routes are mounted under
  `/workspaces/:workspaceId/…` to reuse `requireWorkspaceRole` as the isolation gate on every task
  route. The project/task sub-paths are preserved beneath it.
- **No `ARCHIVED`-style task status** — workflow `status` and derived `blocked` are kept orthogonal on
  purpose; completion is signalled by `status=DONE` + `completedAt`, dependencies by the edge graph.
- **Kanban without drag-and-drop** — §5 permits this only if reliable + accessible; button-driven
  column moves were chosen for guaranteed keyboard/screen-reader support and honest failure recovery.
- Windows `Write`/`SearchReplace` reintroduced CRLF + prop-removal formatting drift across Phase 5
  files; all were normalized with `prettier --write` so `format:check` stays green.

### Validation executed & results (all run in-session, none assumed)

| Check      | Command                 | Result                                                       |
| ---------- | ----------------------- | ------------------------------------------------------------ |
| Migrations | `prisma migrate status` | ✅ 4 migrations; DB schema up to date                        |
| Typecheck  | `pnpm -r typecheck`     | ✅ shared + api + desktop                                    |
| Lint       | `pnpm lint`             | ✅ 0 problems (exit 0)                                       |
| Format     | `pnpm format:check`     | ✅ all Prettier-clean                                        |
| Tests      | `pnpm -r test`          | ✅ **128** backend (8 files) + **33** desktop (5 files)      |
| Build      | `pnpm -r build`         | ✅ api tsc→dist; desktop electron-vite main/preload/renderer |

- **New backend coverage** — `tasks.test.ts` adds **29** integration tests against real PG: create
  (defaults status/priority, activity `CREATED`), edit + `UPDATED` activity, delete cascades
  edges/activity, assign/unassign + membership validation (`INVALID_ASSIGNEE`), status transitions
  (DONE stamps/clears `completedAt`, dependent task NOT auto-moved), priority change, dependency
  create + `blocked` derivation, self/duplicate/out-of-scope/**circular** rejection, project-boundary
  - cross-workspace rejection (foreign id → **404**), PRIVATE-project task denied at the gate, RBAC
    (MEMBER vs OWNER/ADMIN manage), unauthenticated `401`, list filters/sort + keyset cursor, activity
    pagination, and the assigned-to-me aggregate respecting visibility.
- Phase 2/3/4 remain green (auth + workspaces + members + invitations + chat + webhook + projects),
  now subsumed in the **128**-test total. Desktop adds `TasksPanel.test.tsx` (**8** — list render,
  search/filter, create, kanban move + persistence, detail edit, dependency/blocked display, empty
  & error states) and `MyWorkScreen.test.tsx` (**4** — grouped aggregation, open + status update,
  empty state), for **33** desktop tests across 5 files.

### Known issues / remaining work

- **Task realtime is genuinely deferred** — it needs a Nexconn domain-event broadcast that does not
  exist yet; the app is fully API-backed with optimistic UI + rollback, never a faked push. Wiring
  real task events belongs to a later, authorized phase once the provider capability is validated.
- Renderer production bundle remains ~2 MB (Phase 3 Web IMLib); the added task code is negligible —
  a future `manualChunks` pass is an optimization, not a correctness issue.

### Out-of-scope confirmation (Phase 5 exclusions honored)

No conversation→task, Decision Vault, Team Pulse, AI task generation/recommendations, Execution
Intelligence, automatic ownership, predictive risk, Connected Apps, external integrations, time
tracking, billing, advanced reporting, Gantt charts, subtask hierarchies or recurring tasks were
started. **No Phase 6 features begun.**

**Phase 5 status: COMPLETE & verified (all quality gates green).**

---

## Phase 4 — Projects & Project Structure

**Date:** 2026-11-04 · **Status:** Complete & verified (all gates green; live HTTP CRUD smoke run) ·
**Scope:** the **Projects foundation** — a workspace-scoped `Project` entity with server-side RBAC,
a versioned validated REST surface, a full Electron IPC chain and an Impeccable renderer surface.
**Deliberately excluded** (Phase 4 brief): tasks/Kanban, conversation→task, assignment/dependencies,
Decision Vault, Team Pulse, Execution Intelligence, risk/dependency intelligence, AI, new
integrations, payments, analytics. **No future-phase features were begun.**

### Work completed

- **Data layer** — additive, non-destructive migration `20261104055810_add_projects` (a `CREATE`
  `Project` table + enums + indexes only, no `DROP`; Phase 2/3 data preserved; applied against the
  Docker PG `bt-postgres`). `Project` carries `id, workspaceId, name, slug, description, projectKey,
status, visibility, ownerId, createdById, startDate, targetDate, icon, color, createdAt,
updatedAt, archivedAt`; `status` (`PLANNING/ACTIVE/ON_HOLD/COMPLETED`) and `visibility`
  (`WORKSPACE/PRIVATE`) are enums; **`projectKey` and `slug` are each `@@unique([workspaceId, …])`**
  (unique within a workspace, not globally); `ownerId`/`createdById` FKs are `onDelete: Restrict` (a
  project always points at real members; departing an owner is not silently orphaned). **Archived is
  marked solely by `archivedAt`** — intentionally kept out of the `status` enum so archiving never
  overwrites a real workflow status. There is **no separate project-membership table**: authorization
  rides existing workspace membership (a deliberate schema choice for this phase).
- **Backend** (`apps/api`, layered route→controller→service→repository, only repos touch Prisma) —
  versioned `/api/v1/workspaces/:workspaceId/projects` mounted AFTER `authenticate` +
  `requireWorkspaceRole('MEMBER')` with `mergeParams`, so `:projectId` reads are always scoped to the
  path workspace (**cross-workspace id → 404**). Endpoints: list (GET `/`), create (POST `/`), get
  (GET `/:projectId`), overview (GET `/:projectId/overview`), update (PATCH `/:projectId`), archive +
  restore (POST `/:projectId/archive|restore`). Zod at the edge (`projects.schemas.ts`; a new
  `validateQuery` middleware populates `req.validatedQuery`), all responses in the `{data,error,meta}`
  envelope. List supports **scope** (all/active/archived), **status filter**, case-insensitive
  **search** (name + key), **sort** (createdAt/updatedAt/name) + dir, and **keyset cursor pagination**
  (`meta.cursor`). `projectKey`/`slug` are generated server-side and uniquified (`-2`, `-3`, … with a
  DB-unique-constraint backstop mapping a race → `409`).
- **Server-side authorization (the security boundary — the UI only mirrors it):** OWNER/ADMIN manage
  every project in the workspace; a **MEMBER** may view workspace-visible projects, **create**, and
  manage (update/archive/restore/change-owner) **only the projects they own or created**; assigning or
  reassigning a project owner to someone else is an OWNER/ADMIN action and the target **must be a
  current workspace member** (`OWNER_NOT_MEMBER` otherwise). A **PRIVATE** project is visible only to
  its owner/creator and workspace OWNER/ADMIN; a denied PRIVATE read returns **404 (existence not
  leaked)**. Authorization is re-derived from the DB on every mutation; archive/restore are idempotent
  via `archivedAt`.
- **Shared contracts** — `packages/shared/src/projects.ts` (`ProjectView`, `ProjectOverview`,
  `CreateProjectInput`, `UpdateProjectInput`, `ProjectListQuery`, status/visibility/scope/sort unions
  - the `^[A-Za-z0-9][A-Za-z0-9_-]{1,11}$` key shape) exported from the barrel; both sides of the
    Electron boundary compile against one source of truth.
- **Electron integration** — projects flow through the existing hardened bridge, no new privilege:
  `shared/desktop.ts` adds a `DesktopBridge.projects` namespace + six IPC channels; `main/ipc.ts`
  registers sender- (`assertTrustedSender`) and argument-validated handlers (`reqId` for
  path-interpolated workspace/project ids; `buildCreateProject`/`buildUpdateProject`/
  `buildProjectListQuery` allowlist the payload + query); `main/api-client.ts` is the sole
  authenticated caller (query allowlisted/clamped); `preload` re-exports the typed methods. **Tokens
  never reach the renderer** (`lib/data.ts` unwraps `IpcOutcome`→`BridgeError`).
- **Renderer (Impeccable, Operate mode)** — one nav entry (**Projects**) opening:
  `ProjectsScreen` (All/Active/Archived scope tabs, 300 ms-debounced search, create button) with
  honest **loading / empty / no-results / error** states and **no fabricated projects**;
  `CreateProjectDialog` (name required + optional description/status/visibility/start·target dates/
  icon; the owner picker appears only for OWNER/ADMIN; server generates the key/slug; both-side field
  - banner validation; navigates into the project on success); `ProjectWorkspace` (header +
    **Overview · Conversations · Settings** tabs — deliberately **not** Tasks/Decisions) and
    `ProjectSettingsPanel` (edit fields, change owner, and **confirm-gated archive/restore**, never
    removing the last owner). `lib/rbac.ts` (`canManageProject`/`canAssignProjectOwner`) is
    visibility-only, mirroring the server.
- **Nexconn — honest deferral** — Phase 3 supports only workspace **GROUP** and **DIRECT**
  conversations; there is **no** project-scoped conversation capability and no project↔channel link.
  Rather than invent an SDK method or fake a screen (§10/§11), the **Conversations** tab renders a
  clear empty state that routes the user to workspace Messages. The contract for future project
  channels is documented (feature-map / DB `ChannelLink`) but **not implemented**; the App Secret
  remains server-side only.

### Deviations / decisions under fire

- **Roadmap naming** — the roadmap labelled Phase 4 “Conversation → work”; the **authorized brief**
  (Projects foundation, tasks/conversation→task deferred) is authoritative and is what shipped.
- **No project-membership table** — access is derived from workspace membership + the owner/creator +
  visibility rules, keeping this phase’s schema minimal (per-project membership is a later-phase
  question, not assumed here).
- **`archivedAt` is the sole archive marker** — `ARCHIVED` was intentionally omitted from `ProjectStatus`
  so archiving never clobbers the real workflow status, and restore returns the prior status untouched.
- Windows `Write` produced CRLF files while the repo enforces `endOfLine: "lf"`; every new file was
  normalized with `prettier --write` (and three pre-existing files that only failed the format gate —
  `load-env-file.ts`, `schemas.ts`, `api-ready.ts` — were reformatted line-endings only, no behavior
  change) so the repo’s own `format:check` gate stays green.

### Validation executed & results (all run in-session, none assumed)

| Check      | Command                 | Result                                                            |
| ---------- | ----------------------- | ----------------------------------------------------------------- |
| Migrations | `prisma migrate status` | ✅ 3 migrations; DB schema up to date                             |
| Typecheck  | `pnpm -r typecheck`     | ✅ shared + api + desktop                                         |
| Lint       | `pnpm lint`             | ✅ 0 problems (exit 0)                                            |
| Format     | `pnpm format:check`     | ✅ all Prettier-clean                                             |
| Tests      | `pnpm -r test`          | ✅ **99** backend (7 files) + **21** desktop (3 files)            |
| Build      | `pnpm -r build`         | ✅ api tsc→dist; desktop main 42.2 kB · preload 5.1 kB · renderer |

- **New backend coverage** — `projects.test.ts` adds **21** integration tests against real PG: create
  (owner defaults to creator, generated key/slug + regex, suggested-key dedup `ALPHA`→`ALPHA-2`),
  empty-name `400 VALIDATION_FAILED`, MEMBER cannot assign a foreign owner (`403 INSUFFICIENT_ROLE`)
  while ADMIN can, non-member owner `400 OWNER_NOT_MEMBER`, invalid date `400`, scope/status/search
  filtering, keyset pagination via `meta.cursor`, get + overview, PRIVATE hidden from a co-member
  (`404`, and excluded from the list) yet visible to owner/creator + ADMIN, own-project update ok vs
  co-member `403`, ADMIN oversight, empty patch `400`, owner reassign, idempotent archive/restore,
  non-member collection `403 NOT_A_MEMBER`, unauthenticated `401`, cross-workspace id `404`.
- Phase 2/3 remain green (auth + workspaces + members + invitations + chat + webhook), now subsumed in
  the 99-test total. Desktop adds a **Projects** smoke test (bridge-mocked list rendering “Website
  Relaunch”/`WEB`), for 21 desktop tests across 3 files.
- **Live runtime** — the running API served `/health` (`status: ok`) and the projects route returned
  `401 UNAUTHENTICATED` (wired + authenticated, not 404); real CRUD was additionally exercised over
  HTTP end-to-end (register → workspace → create → list → overview → archive).

### Known issues / remaining work

- **Project-scoped conversations** are genuinely deferred — they need a Nexconn project-channel
  capability that does not exist yet; the Conversations tab is an honest bridge to Messages, never a
  fabricated thread. Wiring real project channels belongs to a later, authorized phase.
- Renderer production bundle remains ~2 MB (Phase 3 Web IMLib); the added Projects code is negligible
  — a future `manualChunks` pass is an optimization, not a correctness issue.

### Out-of-scope confirmation (Phase 4 exclusions honored)

No tasks, Kanban board, conversation→task, assignment/dependencies, Decision Vault, Team Pulse,
Execution Intelligence, risk/dependency intelligence, AI, new integrations, analytics or payments were
started. **No Phase 5 features begun.**

**Phase 4 status: COMPLETE & verified (all quality gates green + live HTTP CRUD).**

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
