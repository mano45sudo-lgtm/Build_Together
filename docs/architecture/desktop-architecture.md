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
      ipc.ts      # ipcMain handlers (every sender origin-validated) + IpcOutcome envelope
      api-client.ts # sole authenticated HTTP client: bearer, refresh-once-on-401, typed ops
      session-store.ts # safeStorage-encrypted token pair in userData; memory-only if unavailable
      window.ts   # BrowserWindow factory, saved bounds and maximize/fullscreen state
      protocol.ts # custom app://bundle scheme (secure origin, file-backed, CSP on response)
      menu.ts     # native application menu (roles + Help → openExternal)
    preload/
      index.ts    # contextBridge: exposes ONLY the typed `window.bt` API (no raw ipcRenderer)
    electron.vite.config.ts # main/preload (CJS) + renderer (React) build orchestration
  src/            # renderer — the React 19 / Vite / Tailwind app (former apps/web)
    main.tsx  App.tsx  index.html
    layouts/AppShell.tsx
    components/   # Sidebar, WindowTitleBar, DesktopWindowFrame + ui/ primitives
    features/     # auth (Welcome), workspace (switcher/onboarding), team (members/invites),
                  # chat (messages), projects (list/create/workspace/settings), home, settings
    state/        # AuthProvider (session + workspace scoping for the renderer)
    hooks/        # useResource (load/error/empty/reload)
    lib/          # bridge (unwrap IpcOutcome→BridgeError), data (window.bt façade), rbac (visibility),
                  # config, cn
    styles/       # Tailwind v4 @theme design tokens
    types/global.d.ts  # declares Window.bt: DesktopBridge
  package.json    # NO "type":"module" → main/preload emit CommonJS (sandboxed preload req.)
```

## Process model & trust boundaries

- **Main** — full Node/Electron privileges. The _only_ place that resolves environment
  config (`BT_API_BASE_URL` → dev `http://localhost:4000` → packaged
  `https://api.buildtogether.app`), owns window/lifecycle, services IPC, and **is the sole
  authenticated API client**: it holds the current session's token pair (encrypted at rest via
  `safeStorage`, in memory only when platform encryption is unavailable), attaches the bearer
  token, refreshes once on 401, and never forwards a token across the bridge. Product secrets
  (password hashes, DB, email creds) stay in `apps/api`.
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

The renderer performs **no** privileged network work and never learns a token. It calls named
`window.bt` methods (auth/users/workspaces/members/invitations/chat/projects); **main** translates each
into an HTTPS call to the Express API, applies the `{ data, error, meta }` envelope, and returns an
`IpcOutcome<T>` — `{ ok, data }` or `{ ok:false, error:{ code, message, details } }` — never
containing a token (`AuthSessionView` = identity + workspaces only). The renderer has no `fetch`
path to the API for authenticated operations. Outside Electron (tests / preview) the bridge is
absent and the app honestly gates to the sign-in screen. There is no hardcoded localhost URL in
any packaged build.

## Build, run & packaging

| Action               | Command                                             | Notes                                                   |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| Dev (HMR + Electron) | `pnpm desktop:dev`                                  | renderer served from `localhost:5173`; dev API `:4000`  |
| Compile bundles      | `pnpm desktop:build`                                | main + preload (CJS) + static renderer → `out/`         |
| Run built bundle     | `electron apps/desktop` (`BT_PROD=1` for prod path) | prod path loads `app://bundle/index.html`               |
| Package installer    | `pnpm desktop:package` (`electron-builder`)         | Windows x64 NSIS → `apps/desktop/release/Cue Setup.exe` |

`electron-vite@6` orchestrates the three entries; its peer range (`vite ^6 ‖ ^7 ‖ ^8`) is
compatible with our Vite 8. `externalizeDepsPlugin` keeps deps external **except**
`@buildtogether/shared`, which is bundled into main/preload because Node cannot import the
source-only package at runtime.

### Windows standalone shell

- Windows alone uses `frame: false`; macOS/Linux retain their native frame and existing menu.
- `WindowTitleBar` supplies draggable CUE branding and Minimize/Maximize-or-Restore/Close
  controls. Buttons use sender-validated IPC; maximize/fullscreen state is synchronized from
  the main process. F11 toggles fullscreen and the custom titlebar hides while fullscreen.
- Drag regions use Electron's `app-region` CSS; controls explicitly opt out with `no-drag`.
- Normal bounds and maximized state are stored in `window-state.json` in the existing
  `BuildTogether` user-data directory, preserving the current Clerk/session storage location.
  Invalid or off-screen saved bounds are recovered onto the primary work area.
- The NSIS installer is Windows x64, per-user, creates Start Menu and Desktop shortcuts, and
  includes an uninstaller. It packages only the desktop app; the API remains remote.
- No production Cue artwork existed in the repository. `build/cue-fallback.ico` is a temporary
  monochrome CUE monogram used for the executable, installer, and shortcuts until final artwork
  is supplied.
- The custom maximize button has not been verified to expose the Windows 11 Snap Layout flyout.
  Do not promise native Snap Layout flyout support from this implementation.

## Known limitations

- Code signing and auto-update are not configured. Installer/build/runtime verification results
  for the standalone Windows milestone are recorded in `docs/development/implementation-log.md`.
- Password reset and email verification are not yet implemented (ADR-0003); invitation email
  uses a clearly-labelled **dev transport** (returns the link to the authorized inviter) until a
  real provider is configured.
- Search and quick-create remain honest placeholders; conversation→task, tasks and Kanban are Phase 5+.
- **Projects** (Phase 4) are functional: the `window.bt.projects` namespace (list/create/getOverview/
  update/archive/restore) is exposed over sender- and argument-validated IPC (`reqId` on the
  path-interpolated workspace/project ids; `buildCreateProject`/`buildUpdateProject`/
  `buildProjectListQuery` allowlist the payload + query), driven by main's authenticated client, with
  the Impeccable Projects surface in the renderer. **Tokens never reach the renderer**.
- macOS-specific menu/window behaviors and `safeStorage` (Keychain) are implemented via standard
  APIs but validated on Windows (DPAPI) only.
- The workspace switcher, team management, invitations and settings are now **functional**
  (Phase 2), backed by server-authoritative data — no longer placeholders.
