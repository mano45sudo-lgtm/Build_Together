---
name: testing-qa
description: "Testing and quality-assurance expectations for BuildTogether across unit, integration, API, component, end-to-end and regression levels using Vitest and Playwright. Use when defining or writing tests for any feature, establishing coverage, testing error/edge states, validating real-time synchronization, or deciding whether a phase is truly complete. No phase is done just because it compiles."
---

# Testing & QA — BuildTogether

A feature is not complete until it is tested. This skill sets the bar for what "done"
means across the stack. Tools: **Vitest** (unit/integration/component) and
**Playwright** (browser E2E). Place tests near the code they cover.

## Test pyramid

| Level | What | Where | Tool |
| --- | --- | --- | --- |
| Unit | Pure functions, services, reducers, hooks | `**/*.test.ts` | Vitest |
| Integration | API routes vs a test DB, service↔repository | `apps/api/**/*.test.ts` | Vitest |
| Component | UI renders states, interactions, a11y roles | `apps/web/**/*.test.tsx` | Vitest + Testing Library |
| E2E | Critical user journeys in a real browser | `e2e/` | Playwright |
| Regression | Bug fixes get a failing test first | alongside fix | Vitest/Playwright |

## Per-feature testing contract

Every feature defines, before implementation, which cases it must satisfy:

1. **Happy path** — the primary success flow.
2. **Error states** — network failure, validation rejection, unauthorized, not-found.
3. **Empty/loading states** — no data, first load, slow response.
4. **Edge cases** — boundaries (0, 1, max), unicode/long input, concurrent edits,
   timezone/DST for dates, pagination ends.
5. **Authorization** — cross-workspace access is denied.

If a feature cannot name these cases, its scope is not yet understood — clarify first.

## Backend tests

- Test services with repositories mocked (business logic in isolation).
- Test controllers/routes against a real Prisma test database (integration), asserting
  the response **envelope** and status codes, including `errorHandler` behavior.
- Assert workspace isolation explicitly: a request scoped to workspace B must not see
  workspace A's rows.
- Keep DB state isolated per test (transaction rollback or fresh fixture).

## Frontend tests

- Test components by role/label (Testing Library), not implementation details.
- Mock the typed `apiClient`; drive loading → success → error → empty renders.
- Cover keyboard reachability and focus for new interactions.

## Real-time synchronization validation

- Do not require live Nexconn infrastructure in unit tests — abstract the SDK behind an
  interface and feed scripted events to verify UI reconciliation (optimistic insert →
  server event → no duplicate; reconnection replays; presence updates).
- Playwright E2E may run against a recorded/mocked Nexconn fixture layer for deterministic
  journeys; mark any test needing the real provider as integration-only and document how
  it is run.

## Quality gate for finishing a phase

1. `pnpm test` (Vitest) passes across changed packages; no skipped/failing tests hidden.
2. New behavior has at least one test per category above that applies.
3. Every bug fixed this phase has a regression test that failed before the fix.
4. E2E journeys for the phase's critical paths pass under Playwright.
5. Report actual pass/fail counts — never claim a test passed that was not run.

Record coverage gaps and untested-but-accepted risks in the phase report rather than
implying full coverage.
