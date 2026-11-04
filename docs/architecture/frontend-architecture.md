# Frontend Architecture (`apps/desktop/src` — Electron renderer)

The UI is the **renderer** process of the desktop app (`apps/desktop`), not a standalone
web app (`apps/web` was retired in Phase 1 — see `desktop-architecture.md`). React + Vite +
TypeScript + Tailwind CSS + Motion + Lucide. Governed by the `frontend-engineering` skill
for code architecture and by **Impeccable** + `DESIGN.md` for visual design.

## Structure

```
apps/desktop/src/
  main.tsx           # mount
  App.tsx            # providers + shell (active-section state)
  layouts/AppShell.tsx  # sidebar · header · main content region
  components/ui/     # design-system primitives (Button, IconButton, Input, Tooltip,
                     #   Avatar, Separator, Dialog, Dropdown, NavItem, EmptyState)
  components/        # Sidebar, ApiStatusIndicator
  features/<domain>/ # (reserved) messaging, tasks, kanban, workspaces, decisions, pulse
  hooks/             # cross-cutting hooks
  lib/               # config (reads window.bt), apiClient (envelope unwrap), nav, cn
  styles/index.css   # Tailwind v4 @theme design tokens + elevation utilities
  types/global.d.ts  # declares Window.bt (the typed preload bridge)
  test/              # Vitest + Testing Library
```

## Desktop boundary

- The renderer never touches Node or `ipcRenderer` directly. It reaches the main process
  only through the typed `window.bt` bridge (`DesktopBridge` in `@buildtogether/shared`).
- API base URL comes from `window.bt.getConfig()` inside Electron, falling back to
  `import.meta.env.VITE_API_BASE_URL` when run outside the shell (tests / browser preview) —
  never a hardcoded localhost production URL.

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

## Built so far (renderer)

Phase 2 delivered the authenticated Operate surfaces (welcome/sign-in/sign-up, first-workspace
onboarding, workspace switcher, team management, settings, profile & security, invitation
acceptance); Phase 3 added the **Messages** surface (workspace two-pane conversations over the mocked
in tests / real Nexconn Web IMLib at runtime); **Phase 4** added the **Projects** surface —
`features/projects/*` (ProjectsScreen list with All/Active/Archived + debounced search,
CreateProjectDialog, ProjectWorkspace with Overview · Conversations · Settings, ProjectSettingsPanel)
reached through the typed `window.bt.projects` bridge and driven by `lib/data.ts`; `lib/rbac.ts`
(`canManageProject`/`canAssignProjectOwner`) only mirrors server authority for visibility. All states
are honest (loading/empty/no-results/error) with **no fabricated data**.

## Not yet built

Global search and quick-create remain honest placeholders. Tasks, the Kanban board,
conversation→task, the Decision Vault, Team Pulse and AI surfaces arrive in later phases and are
designed with Impeccable before implementation. The project **Conversations** tab is currently an
honest bridge to workspace Messages (no project-scoped Nexconn channel capability exists yet).
