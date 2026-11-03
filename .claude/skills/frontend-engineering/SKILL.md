---
name: frontend-engineering
description: "React + Vite + TypeScript + Tailwind implementation architecture for BuildTogether's web app (apps/web). Use when building components, pages, routing, state management, API integration, loading/error states, responsive layout, accessibility, or performance. Delegates visual design decisions to the Impeccable skill; this skill governs code architecture and correctness."
---

# Frontend Engineering — BuildTogether Web

Scope: `apps/web`. React + Vite + TypeScript + Tailwind CSS + Motion + Lucide.
**Impeccable is the authority for visual design** (look, feel, hierarchy, motion,
color, typography). This skill governs *implementation architecture* — how that design
is turned into maintainable, correct, accessible code. When the two overlap, design
intent comes from Impeccable / `DESIGN.md`; structure follows this skill.

## Component architecture

- Small, single-responsibility components. A component that renders three unrelated
  concerns is three components. No monolithic page components holding all logic.
- Separate **composition** from **primitives**: `components/ui/*` (Button, Input, Card —
  generic, design-system-driven) vs `features/<domain>/*` (TaskCard, MessageBubble).
- Containers/hooks own data + behavior; presentational components receive props. Keep JSX
  free of business branching where possible.
- Co-locate each feature: `features/<name>/{components,hooks,api,types}`.

```
apps/web/src/
  main.tsx, App.tsx, router.tsx
  components/ui/          # design-system primitives (built per DESIGN.md)
  features/<domain>/      # messaging, tasks, kanban, workspaces, ...
  layouts/
  hooks/                  # shared, non-feature hooks
  lib/                    # apiClient, env, utils
  styles/                 # tailwind entry, tokens
```

## State management

- Prefer local state and derived state. Lift only where two siblings need a shared source.
- Server state lives in a data-fetching layer (React Query/TanStack-style or a thin
  typed `apiClient` + hooks), **not** in global app state.
- Reserve any global store for genuine cross-cutting client state (session, active
  workspace). Avoid unnecessary global state; no dumping feature data into a store.
- Real-time UI state comes from Nexconn SDK events (see `nexconn-integration`); do not
  poll the API for data the SDK pushes.

## TypeScript conventions

- Strict mode. No `any` except at typed external boundaries, and annotate those
  boundaries. Model API responses with types from `packages/shared`.
- Discriminated unions for UI states (`{ status: 'loading' | 'success' | 'error' }`)
  instead of parallel boolean flags.
- Shared request/response contracts come from `@buildtogether/shared`; never redefine
  API shapes ad hoc in a component.

## API integration

- One typed `lib/apiClient` that unwraps the backend envelope
  (`{ data, error, meta }`) and throws typed errors. Components never call `fetch`
  directly.
- Always handle the three states: loading, error, empty. No silent failures; surface
  errors with recovery affordances, log with the `requestId`.

## Accessibility & semantics (floor, not finish-line)

- Prefer semantic HTML (`button`, `nav`, `main`, `aria-*` where needed). Interactive
  elements must be keyboard-operable with visible focus states.
- Manage focus on route/modal changes. Provide accessible names for icons (Lucide is
  decorative by default — add `aria-label`/hidden text when it conveys meaning).
- Meet the accessibility standard recorded in `DESIGN.md` / `PRODUCT.md` (WCAG 2.1 AA
  target unless a later phase states otherwise).

## Performance

- Route-level code splitting; lazy-load heavy features. Avoid unnecessary re-renders
  (memoize by measured need, not reflexively). Keep Motion animations transform/opacity
  based.
- Virtualize long lists (message streams, task boards) when item counts are unbounded.

## Mandatory rules

- Use Impeccable for any visual-design task; follow the documented design system in
  `DESIGN.md` and its tokens — do not invent one-off colors/spacing.
- No monolithic components; no unnecessary global state; no new dependency without a
  stated reason.
- Reusable UI stays consistent — extend `components/ui`, don't fork near-duplicates.

## Quality checks

1. `pnpm --filter @buildtogether/web typecheck` and `build` pass.
2. Every new screen handles loading / error / empty states.
3. Keyboard-only walkthrough of new interactions works; focus is visible.
4. No `any` outside typed boundaries; API shapes come from `packages/shared`.
5. Visual work cites the Impeccable/DESIGN.md guidance it implemented.
