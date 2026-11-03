# ADR-0002: Desktop framework (Electron)

- **Status:** Accepted
- **Date:** 2026-11-03
- **Deciders:** Principal Architect
- **Related:** [ADR-0001](./ADR-0001-technology-stack.md), [desktop-architecture.md](../architecture/desktop-architecture.md)

## Context

BuildTogether is a **desktop-first** product — a "Builder Workspace" for people who ship
products. Phase 0 shipped a browser-only React scaffold (`apps/web`). Phase 1 must move to a
proper desktop architecture without throwing away the working React foundation, the Express
API, or the shared contracts.

Requirements driving the decision: native window/menu integration, keyboard-first interaction,
a premium desktop feel, secure access to OS capabilities, and reuse of the existing React +
Vite + Tailwind renderer.

## Decision

Adopt **Electron** with:

- **`electron`** (stable `45.x`) — runtime.
- **`electron-vite`** (v6, peer-compatible with our **Vite 8**) — main / preload / renderer build
  orchestration and dev mode.
- **`electron-builder`** (v26) — packaging/distribution direction (configured, not run in Phase 1).
- Reuse the Phase 0 React app as the Electron **renderer**; retire `apps/web`.

## Rationale

- **Reuse**: the existing React 19 / Vite 8 / Tailwind 4 renderer ports directly — lowest migration
  risk and no duplicate frontend apps.
- **Ecosystem maturity**: Electron is battle-tested (VS Code, Slack, Figma desktop) with first-class
  Windows/macOS/Linux support, native menus, and deep documentation.
- **Speed**: proven tooling (`electron-vite`, `electron-builder`) gets a secure, running desktop
  shell fast — matching Phase 1's "stable foundation, not a finished product" objective.
- **Compatibility validated**: `electron-vite@6` declares `vite ^6 || ^7 || ^8`, so it works with our
  existing Vite 8.3.5; TypeScript 6 is used for typechecking (`electron-vite` bundles via esbuild).

## Trade-offs

- Larger installer/binary footprint and higher baseline memory than a native or Tauri app.
- Every shipped Chromium/Node version must be kept current for security (mitigated by the
  dependency-updates skill + Electron's release cadence).

## Alternatives considered

- **Tauri** — much smaller binaries and Rust-based backend; rejected for Phase 1 because it would
  require learning/non-trivial backend investment, a different frontend/tooling integration model,
  and no reuse advantage over our React app. The Electron choice is reversible at the shell boundary
  because product logic lives in the renderer and the remote API, not in desktop-specific code.
- Continuing **browser-only** — rejected: the product is explicitly desktop-first; a browser shell
  cannot provide native menus, windowing, or the premium desktop interaction model.
- **Neutralino / nwjs** — smaller ecosystems, less mature tooling and security guidance.

## Consequences

- A new `apps/desktop` app owns `electron/main`, `electron/preload`, and the React `src` renderer.
- Security posture is now non-negotiable: `contextIsolation: true`, `nodeIntegration: false`,
  sandboxing, CSP, validated IPC senders, and a typed preload bridge (see
  [desktop-architecture.md](../architecture/desktop-architecture.md)).
- Packaging (installers, code signing, auto-update) becomes a later-phase concern; only the config
  direction is established now.
- The renderer talks to the remote Express API over HTTPS with **environment-aware** configuration —
  never a hardcoded localhost production URL.
