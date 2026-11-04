# Testing Strategy

Governed by the `testing-qa` skill. A phase is **not** complete because it compiles. Tools:
Vitest (unit/integration/component) and Playwright (E2E). Tests live near the code.

## Levels & placement

| Level       | Tool                     | Location                        | Covers                                                 |
| ----------- | ------------------------ | ------------------------------- | ------------------------------------------------------ |
| Unit        | Vitest                   | `**/*.test.ts(x)` beside source | Pure logic, services (mocked repos), hooks, utils      |
| Integration | Vitest                   | `apps/api`                      | Routes vs a test DB, service↔repository, error handler |
| Component   | Vitest + Testing Library | `apps/desktop/src` (renderer)   | Render states, interactions, a11y roles                |
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
pnpm --filter @buildtogether/desktop test
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

## Phase 2 state (identity & teams — implemented)

Feature tests began with the first functional phase. **49 backend** + **14 desktop** tests pass.

- **Backend integration (Vitest, real Docker PG `bt-postgres`):** full auth lifecycle
  (register/login/me/logout), Argon2id hashing, refresh **rotation + family reuse detection**
  (a stolen, already-rotated refresh revokes the lineage), generic auth errors / no account
  enumeration, workspace CRUD + **server-side isolation** (cross-workspace access denied),
  RBAC (owner/admin/member mutation rules, owner transfer, self-leave), and the invitation
  lifecycle (create/accept/revoke, expiry, single-use, email+role binding) with rate-limit /
  security cases. Integration files run with `fileParallelism: false` because they share one
  test database (each resets it) — a documented isolation choice, not a flake.
- **Desktop renderer (Vitest + Testing Library, jsdom):** the sign-in gate when no bridge is
  present, and the authenticated shell + active workspace with a mocked `window.bt` bridge;
  plus pure-function tests for the client RBAC visibility rules and invitation-token parsing.
- **E2E (Playwright):** deferred — a full Electron runtime smoke is manual/CI (see
  `environment-setup.md`); no browser E2E journey is claimed as passing.

## Phase 3 state (real-time communication — implemented, mocked-verified)

**78 backend** + **20 desktop** tests pass (Phase 2's 49 + 14 remain green; chat adds 29 backend
across `chat.test.ts` + `webhook.test.ts` and 6 desktop in `MessagesScreen.test.tsx`). All chat tests
use the real API + PostgreSQL with the Nexconn **provider replaced by an in-memory double** — they
prove BuildTogether's OWN guarantees, never that the live provider works (that is credential-gated and
separate; see below).

- **Backend — identity & token (`chat.test.ts`):** a token is minted only for a verified workspace
  member, is user-scoped and short-lived, echoes the public App Key but **never** the App Secret, and
  persists a deterministic `bt-<userId>` external-id mapping; a client cannot mint for another user
  (identity comes from auth, not input); a non-member gets 403; when the provider reports unavailable
  the endpoint **fails closed 503** (no fabricated token).
- **Backend — conversations & authorization (`chat.test.ts`):** GROUP create mirrors to the provider
  (create-group + join-member) and requires a title; DIRECT takes exactly one peer; adding a
  non-workspace-member is refused **before** any provider call and persists nothing; the list returns
  only the caller's conversations (a same-workspace co-worker cannot see a DM they're not in); a
  non-participant reading a conversation is 403; **cross-workspace id manipulation is 404**
  (non-enumerable); adding members to a DIRECT is refused; removal is creator-only (self-leave always
  allowed) and a removed member is immediately cut off; provider `bad_request` maps to a sanitized 400
  and `unavailable` to 503 with **no row persisted**.
- **Backend — webhook (`webhook.test.ts`):** the five verification gates are exercised over real HTTP —
  configured (503 fail-closed), signed (missing headers → 401), fresh (stale timestamp outside the
  replay window → 401 even when correctly signed), valid signature (tampered → 401, nothing recorded),
  and idempotent (redelivery recorded exactly once); a processed event is audited **without** any
  message body. Plus chat rate-limiting (all calls counted → 429) and the pure id helpers.
- **Desktop renderer (`MessagesScreen.test.tsx`, jsdom):** the Web-IMLib transport is mocked (it cannot
  run in jsdom). Tests confirm the screen renders only server-authorized conversations, loads + merges
  history, sends through the transport and shows the ack optimistically **without duplicating** a live
  echo, shows a real typing indicator mapped to a participant name, and — critically — when the
  provider is unavailable it surfaces an honest error and **fabricates no messages** (composer
  disabled, no history fetched).
- **Not yet run (honestly):** live two-account send/receive against the real Nexconn edge, and a
  packaged Electron production smoke of the Messages surface, both require Nexconn test credentials and
  are **pending** — never claimed as passing from mocks (§11/§12/§16). IPC argument-boundary validation
  (`reqId`/`reqKind`/`reqIdArray` in the main process) is enforced by the trusted main process and
  covered by `tsc` + the electron-vite build, not by jsdom (main/preload are out of the renderer test
  scope by configuration).

Nothing untested is implied as covered; the phase report states actual counts and names what
was not run.

## Phase 4 state (projects — implemented, verified)

**99 backend** (7 files) + **21 desktop** (3 files) tests pass — Phase 2/3 remain green, now subsumed in
the totals; projects add **21** backend integration tests (`projects.test.ts`) and **1** desktop smoke
(`App.test.tsx`). All project tests hit the **real** API + PostgreSQL (no provider involved).

- **Backend — CRUD + validation:** create (owner defaults to creator; `projectKey`/`slug` generated and
  matching `^[A-Z0-9_-]{2,12}$`; a suggested-key collision dedups `ALPHA`→`ALPHA-2`); empty name →
  `400 VALIDATION_FAILED`; invalid date → `400 INVALID_DATE`; empty patch → `400`; get + overview
  return the envelope; update re-reads rights per mutation.
- **Backend — authorization & isolation (the security boundary):** a MEMBER cannot assign a foreign owner
  (`403 INSUFFICIENT_ROLE`) while an ADMIN can; a non-member owner target → `400 OWNER_NOT_MEMBER`;
  managing a project you don’t own → `403`; a **PRIVATE** project is invisible to a co-member (`404` on
  read and excluded from the list) yet visible to its owner/creator and ADMIN; a non-member reaching the
  collection → `403 NOT_A_MEMBER`; unauthenticated → `401`; a **cross-workspace `projectId` → 404**
  (`PROJECT_NOT_FOUND`, non-enumerable).
- **Backend — list semantics:** scope (`active`/`archived`), `status` filter, case-insensitive `search`
  over name + key, sort + direction, and **keyset cursor pagination** followed through `meta.cursor`;
  archive/restore are idempotent via `archivedAt`.
- **Desktop renderer (`App.test.tsx`, jsdom):** with `window.bt` mocked, the Projects nav opens the list
  and renders a server-authorized project (“Website Relaunch” / `WEB`) — no fabricated data.
- **Not covered (honestly):** the project **Conversations** tab is an honest bridge to Messages — there is
  no project-scoped Nexconn capability, so no project-channel test exists (nothing is faked/claimed);
  IPC argument-boundary validation (`reqId`/`buildCreateProject`/`buildProjectListQuery` in main) is
  enforced by the trusted main process and covered by `tsc` + the electron-vite build, not jsdom.

All quality gates were re-run in-session and are green: typecheck, lint (0), format:check, test (99+21),
build (api→dist; desktop main/preload/renderer), `prisma migrate status` (3 migrations, up to date), plus
a live HTTP check (health `ok`; projects route `401` unauthenticated; real create→list→overview→archive).
