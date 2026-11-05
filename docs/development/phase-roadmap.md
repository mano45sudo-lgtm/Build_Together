# Phase Roadmap

Phase-gated delivery. Only the currently authorized phase is executed; each phase ends with
the `phase-execution` completion protocol and an explicit stop. Feature scoping within a
phase is confirmed with the user before it begins.

## Phase 0 — Engineering environment _(complete)_

Repository inspection; Impeccable install + design context; project skills; instruction &
documentation set; monorepo structure and compiling scaffolds; environment examples; tooling
(lint/format/typecheck/test); git standards. **No product features.**

## Phase 1 — Desktop product foundation (Electron) _(complete)_

Convert the browser-only scaffold to a **desktop-first** architecture: decide the desktop
framework ([ADR-0002](../decisions/ADR-0002-desktop-framework.md)); establish the Electron
**main / preload / renderer** boundary with a hardened, typed IPC bridge (context isolation,
sandbox, CSP, validated senders, custom `app://` protocol); migrate `apps/web` into the
renderer and retire it; ship the design-token foundation, foundational UI primitives and the
app shell (nav, workspace-switcher/search/quick-create placeholders) with honest empty states.
Backend keeps its health endpoint; the renderer resolves an environment-aware API base. **No
product features** — no auth, workspaces, messaging, tasks, Kanban, decisions, AI or analytics.

> **Roadmap reconciliation.** Phase 1 was originally scoped as "workspaces, identity &
> authorization". The authorized Phase 1 brief re-scoped it to the desktop product foundation;
> the identity/workspace layer — the security/isolation base everything else depends on
> (closes R1) — moves to **Phase 2**. Requirement mappings (`Closes R…`) are unchanged; only
> the phase **numbers** shift by one. Feature tests begin in the first functional phase.

## Phase 2 — Foundation: workspaces, identity & authorization _(complete)_

Self-managed identity in `apps/api` (Argon2id passwords, server-side opaque hashed sessions with
rotation + family reuse detection) per [ADR-0003](../decisions/ADR-0003-authentication.md); Prisma
data layer for `User` / `Session` / `Workspace` / `WorkspaceMembership` / `WorkspaceInvitation` with
a tested, non-destructive migration; workspace-isolation middleware and OWNER/ADMIN/MEMBER RBAC
authorized server-side; versioned, validated, enveloped v1 endpoints for auth, profile, workspaces,
members and invitations; secure invitation tokens (hashed, expiring, single-use, role/email bound)
with an honest dev-only email transport. The Electron **main** process owns the session
(`safeStorage`), proxies authenticated API traffic, and exposes only named, argument-validated IPC;
the renderer never sees a token. Impeccable-designed Operate screens: welcome/sign-in/sign-up,
first-workspace onboarding, workspace switcher, team management (members/roles/invitations),
workspace settings, profile & security, invitation acceptance. 49 backend + 14 desktop tests pass.
**No** messaging, projects, tasks, Kanban, decisions, AI, analytics or integrations (Phase 3+).

## Phase 3 — Real-time communication (Nexconn) _(complete)_

Consulted official Nexconn (RongCloud) docs and integrated the **real** SDKs — no invented APIs
(gate honored). Backend (`apps/api/src/modules/chat`) owns identity mapping (deterministic
`bt-<userId>` external ids), short-lived user-scoped token minting, workspace-scoped conversation
metadata + server-side authorization (participant/creator, cross-workspace → 404), and signature-
verified idempotent webhooks; it stores **no message bodies** (Nexconn owns the stream). Two
conversation kinds — workspace-level **GROUP** and **DIRECT** — mirror to the provider. The Electron
**main** process mints the client token over validated IPC (App Secret never leaves the API); the
sandboxed **renderer** talks to Nexconn directly via Web IMLib for send/history/typing/unread, with an
Impeccable Operate Messages surface (list · view · details · new) added as one nav entry. 78 backend +
20 desktop tests pass (provider mocked; workspace isolation + authz proven; live provider is
credential-gated and **not** claimed). **Honest limitation:** the Web SDK surfaces **typing** (wired
both directions) and real **unread** counts; **presence** and **read receipts** are not exposed by this
SDK build and were deliberately **not faked**. **No** projects, tasks, Kanban, conversation→task,
Decision Vault, AI, analytics or integrations (Phase 4+). Closes R2.

## Phase 4 — Projects & project structure _(complete)_

A workspace-scoped **`Project`** entity (additive, non-destructive migration
`20261104055810_add_projects`: `projectKey`/`slug` unique **within** a workspace, `status`/
`visibility` enums, `ownerId`/`createdById` `Restrict` FKs, `archivedAt` as the sole archive marker).
Versioned, validated, enveloped `/api/v1` endpoints — list (scope/status/search/sort/cursor), create,
get, overview, update, archive + restore — with **server-side project RBAC** riding existing workspace
membership (OWNER/ADMIN full; a MEMBER views workspace-visible projects, creates, and manages only the
projects they own/created; assigning a foreign owner is OWNER/ADMIN and must be a member; **PRIVATE**
projects 404 to non-entitled readers; cross-workspace id → 404). Shared `projects.ts` contracts + a
full Electron IPC chain (bridge → sender-/argument-validated handlers → sole authenticated client →
`window.bt`; tokens never reach the renderer). Impeccable Operate surface: Projects list (All/Active/
Archived + debounced search, honest loading/empty/no-results/error states, no fabricated data), a
concise create dialog, and a project workspace with **Overview · Conversations · Settings** (change
owner; confirm-gated archive/restore; never remove the last owner). **Nexconn project-scoped
conversations are honestly deferred** — Phase 3 exposes only GROUP/DIRECT, so the Conversations tab is
a real bridge to Messages and no SDK method is invented. 99 backend + 21 desktop tests pass; all
quality gates green + live HTTP CRUD verified. **No** tasks, Kanban, conversation→task, Decision Vault,
Team Pulse, AI, analytics or integrations (Phase 5+). Establishes the projects spine R3/R4/R5 build on.

## Phase 5 — Task management, ownership & dependencies _(complete)_

> **Roadmap reconciliation.** This phase was earlier sketched as "conversation → work". The
> **authorized Phase 5 brief** scopes the **execution layer** — tasks with owners, status, priorities,
> due dates, dependencies and activity inside a project — while **conversation→task selection is
> deferred**; that is what shipped. Closes R3, R4, R5.

An additive, non-destructive migration `20261104073845_add_task_management` introduces `Task`,
`TaskDependency` and `TaskActivity` with `TaskStatus`/`TaskPriority`/`TaskActivityType` enums
(**status kept separate from blocked state**). Versioned, validated, enveloped `/api/v1` task
endpoints are mounted under `/workspaces/:workspaceId` so existing workspace-role middleware gates
every route (cross-workspace id → 404): project task list (search/status/priority/assignee filters,
sort, keyset cursor) + create, single get/patch/delete, focused **assignee** and **status** mutations,
dependency get/add/delete, paginated **activity**, and a cross-project **assigned-to-me** aggregate.
Dependencies are validated server-side (same workspace **and** project, no self-edge, no duplicate,
**cycle DFS rejects circular**), `blocked` is **derived** at read from an unfinished prerequisite and
never auto-changes workflow status. Assignees must be current workspace members. Multi-record writes
run in transactions; authorization is re-derived per request. Shared `tasks.ts` contracts + the full
Electron IPC chain (sender-/argument-validated; tokens never reach the renderer). Impeccable Operate
surface: a **Tasks** tab inside the project workspace with a compact **list** view and a **Kanban**
(To Do / In Progress / In Review / Done; move buttons persist with optimistic update + rollback,
**no drag-and-drop**), a focused **task detail** (inline edit, dependencies, activity), a **quick-create**
(title + project required, rest optional), and a real **My Work** screen (Upcoming / In Progress /
Overdue / Completed, all from live API data — no mocks). **Nexconn task realtime is honestly deferred**
(the existing integration is chat-only with no validated domain-event broadcast); the app stays
reliably API-backed with no faked realtime. 128 backend + 33 desktop tests pass; all quality gates

- production builds green. **No** conversation→task, Decision Vault, Team Pulse, AI, time tracking,
  Gantt, subtasks, recurring tasks or integrations (Phase 6+).

## Phase 6 — Decisions & insight _(Decision Vault complete; Team Pulse not started)_

> **Scope note.** The **authorized Phase 6 brief** scoped this execution to the **Decision Vault**
> only. Team Pulse activity/progress signals remain **not started** and require their own
> authorization; nothing was stubbed toward them. Closes R6 (decision capture/retrieve); R7
> (Team Pulse) remains open.

**Decision Vault — complete.** Two additive, non-destructive migrations
(`20261104093318_add_decision_vault` + `20261104104500_decision_vault_lifecycle_and_ownership`)
introduce first-class `Decision` records with `DecisionAlternative`/`DecisionReference`/
`DecisionParticipant`/`DecisionHistory`/`DecisionComment`, a `DRAFT→PROPOSED→APPROVED/REJECTED` (+
`SUPERSEDED`/`ARCHIVED`) **closed state machine**, `DecisionCategory`, an accountable **owner**
(separate from immutable authorship), and considered alternatives/references. Versioned, validated,
enveloped `/api/v1` endpoints mount under `/workspaces/:workspaceId/decisions` (existing workspace-
role middleware gates every route; cross-workspace id → **404**): collection list (status/category/
project/source/participant/owner/search filters, sort, keyset cursor) + create, single get/patch/
delete, **dedicated lifecycle** routes (approve/reject/supersede/archive/restore so history stays
typed), participant add/remove, and paginated **history** + **comments** feeds. Server-side rules
(the boundary — the UI only mirrors them): manager set mirrors `task.service`; **APPROVE requires a
non-empty decision statement**; `SUPERSEDED`/`ARCHIVED` lock content (409); `≤1 chosen alternative`;
owners/participants must be current members; the creator is an immovable participant; every link is
re-validated in-workspace. Shared `decisions.ts` contracts + the full Electron IPC chain
(sender-/argument-validated; tokens never reach the renderer). Impeccable Operate surface in the
established **monochrome** language: a **Decisions** nav entry (workspace vault — Grouped/List,
lifecycle-ordered sections, real empty/loading/error states) and a **Decisions** tab inside the
project workspace, reusing one `DecisionRow`/`DecisionDetail` (inline edit, lifecycle bar,
alternatives REPLACE semantics, references, participants, comments, history timeline) and a minimal
quick-create. **Decision realtime is honestly deferred** (no validated Nexconn domain-event
broadcast) — fully API-backed `mutate→reload`, no faked push. **Context deep-links to a specific
project/conversation are read-only labels** (the shell has no deep-link route yet — not faked).
**163 backend + 36 desktop tests pass; all quality gates (migrations, typecheck, lint, format,
test, build) green.**

**Team Pulse — not started (needs authorization).** Activity/progress signals across the workspace.

## Phase 7 — AI layer _(not authorized)_

Provider-independent server-side abstraction; conversation summaries; action extraction that
**proposes** tasks/decisions for user confirmation (no silent writes). Closes R8.

## Later / candidate (only with product reason)

Notifications, search, attachments policy, external integrations, mobile. Not scheduled;
require an explicit decision + ADR.

## Rules across all phases

- Follow `.claude/skills/*` and `docs/*`; keep docs and `implementation-log.md` current.
- Respect scope restrictions; no premature future-phase features; no fake screens.
- Meet `testing-qa` and `security-review` gates before calling a phase done.

## Status tracker

| Phase | State                                           |
| ----- | ----------------------------------------------- |
| 0     | Complete                                        |
| 1     | Complete (desktop foundation)                   |
| 2     | Complete (identity, workspaces & teams)         |
| 3     | Complete (real-time communication)              |
| 4     | Complete (projects & project structure)         |
| 5     | Complete (task management & dependencies)       |
| 6     | Decision Vault complete; Team Pulse not started |
| 7     | Not started / not authorized                    |
