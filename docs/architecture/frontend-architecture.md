# Frontend Architecture (`apps/web`)

React + Vite + TypeScript + Tailwind CSS + Motion + Lucide. Governed by the
`frontend-engineering` skill for code architecture and by **Impeccable** + `DESIGN.md`
for visual design.

## Structure

```
apps/web/src/
  main.tsx           # mount
  App.tsx            # providers + shell
  router.tsx         # route tree (route-level code splitting)
  components/ui/     # design-system primitives (Button, Input, Badge, Dialog, ...)
  features/<domain>/ # messaging, tasks, kanban, workspaces, decisions, pulse
    components/ hooks/ api/ types/
  layouts/           # app shell, three-pane workspace layout
  hooks/             # cross-cutting hooks
  lib/               # apiClient (envelope unwrap), env, utils, nexconnClient wrapper
  styles/            # tailwind entry + @theme tokens (added when UI begins)
```

## Principles

- **Composition over monoliths.** Small single-responsibility components; UI primitives in
  `components/ui`, feature components compose them.
- **State discipline.** Local/derived state first; server state in a data-fetching layer
  (typed `apiClient` + query hooks), never dumped into a global store. Global store reserved
  for session + active workspace only.
- **Typed contracts.** Request/response types come from `@buildtogether/shared`; UI states
  are discriminated unions (`loading | success | error | empty`).
- **Real-time via events.** Message/presence/receipt state is driven by Nexconn SDK events
  through a thin `nexconnClient` wrapper — no API polling for pushed data; optimistic UI
  reconciled against server events.
- **One visual system.** Colors/typography/spacing use `DESIGN.md` tokens only; no one-off
  values. Motion is subtle, transform/opacity based, honors `prefers-reduced-motion`.

## Data & rendering

- `apiClient` unwraps the backend envelope `{ data, error, meta }` and throws typed errors;
  components never call `fetch` directly and always handle loading/error/empty.
- Long lists (message streams, board columns) virtualize when unbounded.
- Accessibility is a floor: semantic HTML, keyboard operation, visible focus, meaningful
  labels (WCAG 2.1 AA target).

## Not yet built

Phase 0 provides only the compiling scaffold (entry point, config, placeholder page). Feature
components arrive in later phases and are designed with Impeccable before implementation.
