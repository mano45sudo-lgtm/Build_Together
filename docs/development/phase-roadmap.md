# Phase Roadmap

Phase-gated delivery. Only the currently authorized phase is executed; each phase ends with
the `phase-execution` completion protocol and an explicit stop. Feature scoping within a
phase is confirmed with the user before it begins.

## Phase 0 — Engineering environment _(complete)_

Repository inspection; Impeccable install + design context; project skills; instruction &
documentation set; monorepo structure and compiling scaffolds; environment examples; tooling
(lint/format/typecheck/test); git standards. **No product features.**

## Phase 1 — Desktop product foundation (Electron) _(this phase — complete)_

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

## Phase 2 — Foundation: workspaces, identity & authorization _(not authorized)_

Data layer for `User`, `Workspace`, `Membership` + roles; auth/session; workspace isolation
middleware; workspace/team management UI. Design system extended via Impeccable.

## Phase 3 — Real-time communication (Nexconn) _(not authorized)_

Consult official Nexconn docs; identity mapping + backend token minting; direct & group
messaging UI via the SDK; message events, presence, read receipts; reconnection handling.
Closes R2. (Gate: Nexconn capabilities confirmed from docs — no invented APIs.)

## Phase 4 — Conversation → work _(not authorized)_

Projects & project channels; select-message → task creation with provenance; task
assignment; Kanban board (drag + keyboard). Closes R3, R4, R5.

## Phase 5 — Decisions & insight _(not authorized)_

Decision Vault (capture with context, retrieve, soft-delete history); Team Pulse activity/
progress signals. Closes R6, R7.

## Phase 6 — AI layer _(not authorized)_

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

| Phase | State                                    |
| ----- | ---------------------------------------- |
| 0     | Complete                                 |
| 1     | Complete (desktop foundation, this work) |
| 2–6   | Not started / not authorized             |
