# ADR-0005: Execution Intelligence — Deterministic, Explainable Signals

- **Status:** Accepted
- **Date:** 2026-11-05
- **Deciders:** Principal Engineer
- **Related:** [ADR-0001](./ADR-0001-technology-stack.md), [ADR-0003](./ADR-0003-authentication.md), [ADR-0004](./ADR-0004-nexconn-communication.md), [backend-architecture.md](../architecture/backend-architecture.md), [database-architecture.md](../architecture/database-architecture.md)

## Context

Phase 7 (the **Execution Intelligence Engine**) adds contextual intelligence on top of the existing
project / task / conversation / Decision-Vault infrastructure. The brief is explicit that this is
**not** a generic AI chatbot: the product must explain project health, blockers, risks, next-best
actions, and decision-revision impact, and remain fully useful **without** any LLM. Two properties
dominate the design:

- **Explainable & deterministic** — health must come from real completion / overdue / blocked /
  deadline / decision-review facts, never an arbitrary score; a risk must state WHAT / WHY / EVIDENCE /
  ACTION; AI must never invent health or silently mutate data (§3A, §D, §13).
- **Authorized & workspace-isolated** — every signal is derived only from data the caller can already
  see; no unrestricted data is ever handed to a model; workspace isolation stays a security boundary.

The engine must therefore work with zero AI present, and later accept an optional AI layer that can
only **supplement** clearly-labeled structured signals, never replace or fabricate them.

## Decision

### 1. Compute on read; store almost nothing

Health, blockers, risks, recommendations and decision-impacts are **derived at request time** from
live rows and returned as transient DTOs. Nothing derived is persisted, so a snapshot can never drift
from reality (database-architecture: prefer deriving over storing for time-sensitive, regenerating
data). Only two genuinely durable things are added, via one **additive, non-destructive** migration
(`20261105042725_add_execution_intelligence`):

- `IntelligenceDismissal` — a user's `DISMISSED`/`RESOLVED` state on a computed signal, unique on
  `(workspaceId, userId, kind, dedupKey)`. Dismissing hides an item from **that user's** list; it never
  rewrites health, another user's view, or the underlying record.
- `Notification` — a first-class, workspace-scoped notification (dedup on `(workspaceId, userId,
dedupKey)`, indexed for the inbox). **The model + migration exist now** (authorized); the producer
  wiring that emits notifications and the consumer endpoints land in a later increment.

### 2. A documented rules engine, not a scoring model

Each detector is a **total, pure function** over already-authorized signal rows plus an explicit
`now` — no Prisma, no Express, no ambient clock — so it is unit-testable and reproducible:

- `intelligence/health.ts` — `computeMetrics` (raw counts) then `computeHealth`, whose state is the
  **worst severity** among documented factors (RISK → `AT_RISK`, ATTENTION → `NEEDS_ATTENTION`, else
  `ON_TRACK`). Every threshold lives once in `intelligence/common.ts`.
- `intelligence/blockers.ts` — structured sources only (unfinished/overdue prerequisite, awaiting a
  decision, a decision needing review). **Reuses** the derived unfinished-prerequisite relationship —
  there is no stored "blocked" status and detection never changes a task. The brief's "unresolved
  clarification" source is **honestly omitted** because no such entity exists (we never fabricate one).
- `intelligence/risk.ts` — LOW/MEDIUM/HIGH from real signals (overdue, due-soon, long-running, blocked,
  awaiting decision, repeated due-date changes), each carrying WHAT/WHY/EVIDENCE/ACTION.
- `intelligence/recommendations.ts` — next-best actions **derived from an already-detected signal**,
  each pointing at a real entity with a destination; deduplicated and priority-sorted.
- `intelligence/impacts.ts` — built entirely on the Phase 6 supersede chain: a `SUPERSEDED` decision's
  linked **live** tasks may need review; deleted tasks are skipped (never invented); we never rewrite
  a task.
- `intelligence/personal.ts` — buckets the caller's own visible work (`overdue`/`upcoming`/`blocked`/
  `awaitingMyReview`) feeding My Work, with personal next-actions.

### 3. Layering + authorization reuse (no parallel services)

The domain follows the existing layered contract: `intelligence.repo.ts` is the **only** Prisma layer;
`services/intelligence.service.ts` is the sole orchestrator; controllers ≤ thin; routes carry
`mergeParams`. A project read is gated through the **existing** `project.service.getProject` (workspace
membership already proven at the mount by `authenticate` + `requireWorkspaceRole('MEMBER')`; this adds
project visibility → a foreign or PRIVATE project the caller cannot see is a **404**, a non-member is a
**403**). Personal intelligence reuses `task.service.listMyTasks`, already visibility-filtered. The
router is mounted at `/api/v1/workspaces/:workspaceId/intelligence` behind its own `intelligenceLimiter`
(`INTELLIGENCE_RATE_LIMIT` / 5 min). No new service, model, or response envelope was duplicated.

### 4. AI is a deferred, provider-independent seam (fails closed)

Per the authorized scope, this increment ships the deterministic foundation only. The AI context layer
(§4) will reuse the existing provider-abstraction pattern (like the chat `ChatProvider`): a
provider-independent interface, server-side keys, structured + validated output, **optional** — the
product works fully with no model configured, and any AI output may only add clearly-labeled
supplementary signals with evidence, never auto-execute or auto-mutate. **No vendor dependency is
committed** and no SDK method is invented. `.env.example` carries inert `AI_PROVIDER` /
`AI_API_KEY` placeholders for that phase.

## Consequences

- **Positive:** the product delivers real intelligence with zero AI; every claim is checkable against
  concrete entities; determinism makes it unit-testable (13 engine tests) and stable; workspace isolation
  and project visibility are enforced by reuse, not reimplemented; storing only dismissals avoids schema
  bloat and drift.
- **Accepted limits:** conversation-based (AI) blocker detection is out of this increment — PostgreSQL
  stores no message bodies (Nexconn owns them), so it needs the deferred AI seam, not this engine. The
  `Notification` model is present but not yet emitted/consumed. Desktop surfaces (§8) and the AI seam
  (§4) land in the next authorized increments.
- **Non-goals honored:** no autonomous agents, no auto task/decision rewriting, no auto-assignment, no
  productivity surveillance, no generic chatbot, no unrestricted AI data access (§13).
