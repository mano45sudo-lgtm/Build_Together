# Desktop Architecture (`apps/desktop`)

BuildTogether is **desktop-first**. The client is an **Electron** app with the canonical
three-process model — a trusted **main** process, a hardened **preload** bridge, and a
**renderer** that runs the React app migrated from the retired `apps/web`. Chosen in
[ADR-0002](../decisions/ADR-0002-desktop-framework.md); governed by `frontend-engineering`
(renderer) and `security-review` (main/preload/IPC).

```
apps/desktop/
  electron/
    main/         # trusted Node process: window, lifecycle, security, IPC, menu, protocol
      index.ts    # bootstrap: single-instance lock → scheme → ready → handlers → window
      config.ts   # environment-aware API base + trusted renderer origin
      security.ts # CSP, permission deny-all, navigation/window guards, external-url routing
      ipc.ts      # ipcMain handlers (every sender origin-validated)
      window.ts   # BrowserWindow factory (sandbox, contextIsolation, no nodeIntegration)
      protocol.ts # custom app://bundle scheme (secure origin, file-backed, CSP on response)
      menu.ts     # native application menu (roles + Help → openExternal)
    preload/
      index.ts    # contextBridge: exposes ONLY the typed `window.bt` API (no raw ipcRenderer)
    electron.vite.config.ts # main/preload (CJS) + renderer (React) build orchestration
  src/            # renderer — the React 19 / Vite / Tailwind app (former apps/web)
    main.tsx  App.tsx  index.html
    layouts/AppShell.tsx
    components/   # Sidebar, ApiStatusIndicator + ui/ primitives (Button, Input, Dialog, ...)
    lib/          # config (reads window.bt), apiClient (health), nav, cn
    styles/       # Tailwind v4 @theme design tokens
    types/global.d.ts  # declares Window.bt: DesktopBridge
  package.json    # NO "type":"module" → main/preload emit CommonJS (sandboxed preload req.)
```

## Process model & trust boundaries

- **Main** — full Node/Electron privileges. The _only_ place that resolves environment
  config (`BT_API_BASE_URL` → dev `http://localhost:4000` → packaged
  `https://api.buildtogether.app`), owns window/lifecycle, and services IPC. Holds no user
  secrets beyond env (secrets stay in `apps/api`).
- **Preload** — sandboxed **CommonJS** script injected before the renderer. Bridges a
  minimal, allowlisted, typed surface (`window.bt`) via `contextBridge`. Never exposes
  `ipcRenderer`, `require`, or any Node global.
- **Renderer** — the React app. Treated as **untrusted**: no Node access, restricted by CSP,
  talks to main only through `window.bt` and to the remote API over HTTPS. Falls back to
  `import.meta.env.VITE_API_BASE_URL` when run outside Electron (tests / browser preview).

The shared contract lives in `@buildtogether/shared` (`src/desktop.ts`): `DesktopConfig`,
`DesktopBridge`, and the `IPC` channel map — so both sides of the boundary compile against
one source of truth and cannot drift.

## Security posture (traceable to the Electron security checklist)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`
  on every `BrowserWindow`.
- **IPC sender validation** — each `ipcMain` handler asserts
  `event.senderFrame.origin === trustedRendererOrigin()` (`http://localhost:5173` in dev,
  `app://bundle` in prod) before doing anything; untrusted senders throw. (#17)
- **Never expose raw IPC** — preload re-exports named async methods only. (#20)
- **Custom `app://bundle` scheme** registered as privileged (standard/secure/
  supportFetchAPI) and served via `protocol.handle` + `net.fetch` with a path-traversal
  guard confined to the renderer root — avoids a `file://` origin. (#18)
- **Content-Security-Policy** applied through `session.webRequest.onHeadersReceived` (and
  attached to protocol responses): `default-src 'self'; script-src 'self'; object-src
'none'; frame-src 'none'; base-uri 'self'; form-action 'none'; upgrade-insecure-requests`
  (+ `connect-src 'self' https:`). Dev relaxes `connect-src` for the Vite HMR socket and the
  local API only.
- **Navigation & window guards** — `will-navigate` prevented unless the trusted origin;
  `setWindowOpenHandler` denies all new windows; https links route to `shell.openExternal`
  after `new URL` validation (non-https rejected).
- **Permissions** — `session.setPermissionRequestHandler` denies everything by default.

## Renderer ⇄ API communication

The renderer performs **no** privileged work and never learns a secret. It resolves the API
base from `window.bt.getConfig()` (main-supplied, environment-aware) and calls the Express
API over HTTPS using the shared `{ data, error, meta }` envelope (`src/lib/apiClient.ts`).
Phase 1 exercises only the health endpoint; authentication, workspaces and messaging are
later phases. There is no hardcoded localhost URL in any packaged build.

## Build, run & packaging

| Action               | Command                                             | Notes                                                  |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| Dev (HMR + Electron) | `pnpm desktop:dev`                                  | renderer served from `localhost:5173`; dev API `:4000` |
| Compile bundles      | `pnpm desktop:build`                                | main + preload (CJS) + static renderer → `out/`        |
| Run built bundle     | `electron apps/desktop` (`BT_PROD=1` for prod path) | prod path loads `app://bundle/index.html`              |
| Package installers   | `pnpm desktop:package` (`electron-builder`)         | **configured, not run in Phase 1**                     |

`electron-vite@6` orchestrates the three entries; its peer range (`vite ^6 ‖ ^7 ‖ ^8`) is
compatible with our Vite 8. `externalizeDepsPlugin` keeps deps external **except**
`@buildtogether/shared`, which is bundled into main/preload because Node cannot import the
source-only package at runtime.

## Known limitations (Phase 1)

- Packaging/code-signing/auto-update are **not executed** — only the built-bundle production
  path was smoke-launched; a real installer runtime is untested.
- Navigation targets, workspace switcher, search and quick-create are honest placeholders —
  no future-phase functionality is wired.
- macOS-specific menu/window behaviors are implemented via standard roles but were validated
  on Windows only.
