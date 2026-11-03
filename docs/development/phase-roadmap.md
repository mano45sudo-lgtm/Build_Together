# Phase Roadmap

Phase-gated delivery. Only the currently authorized phase is executed; each phase ends with
the `phase-execution` completion protocol and an explicit stop. Feature scoping within a
phase is confirmed with the user before it begins.

## Phase 0 — Engineering environment _(this phase)_

Repository inspection; Impeccable install + design context; project skills; instruction &
documentation set; monorepo structure and compiling scaffolds; environment examples; tooling
(lint/format/typecheck/test); git standards. **No product features.**

## Phase 1 — Foundation: workspaces, identity & authorization

Data layer for `User`, `Workspace`, `Membership` + roles; auth/session; workspace isolation
middleware; workspace/team management UI shell. Design system primitives via Impeccable.
Closes R1 and the security/isolation foundation everything else depends on.

## Phase 2 — Real-time communication (Nexconn)

Consult official Nexconn docs; identity mapping + backend token minting; direct & group
messaging UI via the SDK; message events, presence, read receipts; reconnection handling.
Closes R2. (Gate: Nexconn capabilities confirmed from docs — no invented APIs.)

## Phase 3 — Conversation → work

Projects & project channels; select-message → task creation with provenance; task
assignment; Kanban board (drag + keyboard). Closes R3, R4, R5.

## Phase 4 — Decisions & insight

Decision Vault (capture with context, retrieve, soft-delete history); Team Pulse activity/
progress signals. Closes R6, R7.

## Phase 5 — AI layer

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

| Phase | State                        |
| ----- | ---------------------------- |
| 0     | In progress (this work)      |
| 1–5   | Not started / not authorized |
