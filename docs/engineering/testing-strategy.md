# Testing Strategy

Governed by the `testing-qa` skill. A phase is **not** complete because it compiles. Tools:
Vitest (unit/integration/component) and Playwright (E2E). Tests live near the code.

## Levels & placement

| Level       | Tool                     | Location                        | Covers                                                 |
| ----------- | ------------------------ | ------------------------------- | ------------------------------------------------------ |
| Unit        | Vitest                   | `**/*.test.ts(x)` beside source | Pure logic, services (mocked repos), hooks, utils      |
| Integration | Vitest                   | `apps/api`                      | Routes vs a test DB, service↔repository, error handler |
| Component   | Vitest + Testing Library | `apps/web`                      | Render states, interactions, a11y roles                |
| E2E         | Playwright               | `e2e/`                          | Critical user journeys in a real browser               |
| Regression  | either                   | alongside fix                   | Every bug gets a test that failed before the fix       |

## Per-feature contract (defined before implementing)

Each feature must specify cases for: **happy path**, **error states** (network, validation,
unauthorized, not-found), **empty/loading**, **edge cases** (0/1/max, long & unicode input,
concurrent edits, date/timezone boundaries, pagination ends), and **authorization**
(cross-workspace access denied).

## Guidance by area

- **Backend:** mock repositories to test services in isolation; run routes against a real
  Prisma test database (per-test isolation via transaction rollback/fixtures); assert the
  `{data,error,meta}` envelope + status codes; explicitly assert workspace isolation.
- **Frontend:** query by role/label, not implementation details; mock the typed `apiClient`
  and drive loading→success→error→empty; cover keyboard + focus.
- **Real-time (Nexconn):** abstract the SDK behind an interface; feed scripted events to test
  optimistic insert → server event → no duplicates, reconnect replay, presence updates. E2E
  may run against recorded/mocked Nexconn fixtures; any test needing the live provider is
  marked integration-only and documented.

## Commands

```
pnpm test                     # Vitest, all packages
pnpm --filter @buildtogether/web test
pnpm --filter @buildtogether/api test
pnpm test:e2e                 # Playwright (after pnpm exec playwright install)
```

## Phase quality gate

1. `pnpm test` passes across changed packages; no hidden skips/fails.
2. New behavior has ≥1 test per applicable category.
3. Every bug fixed this phase has a regression test.
4. E2E for the phase's critical journeys passes.
5. Report **actual** pass/fail counts; name anything not run.

Coverage % is a signal, not the goal — behavior + edge + authorization coverage is what
matters. Accepted untested risks are recorded in the phase report, never implied as covered.

## Phase 0 state

Scaffolds include a Vitest config and one trivial smoke test per app so the test toolchain
is verified to run. Feature tests begin in Phase 1+.
