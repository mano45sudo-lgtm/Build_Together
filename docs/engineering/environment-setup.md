# Environment Setup

Prerequisites and steps to run BuildTogether locally. Placeholders only — never commit real
secrets.

## Prerequisites

| Tool       | Version                         | Notes                                                   |
| ---------- | ------------------------------- | ------------------------------------------------------- |
| Node.js    | ≥ 20 LTS (repo verified on v24) | Required by Vite 8 / tooling.                           |
| pnpm       | ≥ 9 (repo verified on 11.x)     | Package manager; workspaces rely on it.                 |
| Git        | any recent                      | Conventional Commits.                                   |
| PostgreSQL | 15+                             | Local or container for the API in data phases.          |
| Electron   | stable `45.x`                   | Pulled by `pnpm install`; binary downloaded on install. |

Verify: `node -v; pnpm -v; git --version`.

> If the Electron binary is missing after install (empty `path.txt` / no `electron.exe`),
> run `node node_modules/electron/install.js` once to complete the download.

## First-time setup

```bash
pnpm install                      # install all workspace deps (run at repo root)
cp apps/desktop/.env.example apps/desktop/.env
cp apps/api/.env.example apps/api/.env
# fill apps/api/.env with local values (see variable table below)
```

Run the desktop app against the API:

```bash
pnpm --filter @buildtogether/api dev   # API on :4000
pnpm desktop:dev                       # Electron + renderer (HMR on :5173)
```

Desktop scripts (root): `pnpm desktop:dev` · `pnpm desktop:build` (compile
main/preload/renderer to `out/`) · `pnpm desktop:package` (`electron-builder`, configured —
not run in Phase 1). Run the built bundle without an installer with
`electron apps/desktop` (set `BT_PROD=1 BT_SMOKE=1` to exercise the production code path).

## PostgreSQL (for data phases)

Point `DATABASE_URL` at a local/dev database, then:
`pnpm --filter @buildtogether/api prisma:migrate` and `prisma:generate`. No schema exists in
Phase 0; these commands become live when the database phase is authorized.

## Environment variables

### `apps/desktop/.env`

| Variable            | Purpose                                                                                                                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BT_API_BASE_URL`   | API base resolved by the trusted **main** process and handed to the renderer over IPC. Environment-aware; leave unset for built-in dev (`http://localhost:4000`) / packaged prod (`https://api.buildtogether.app`) defaults. |
| `VITE_API_BASE_URL` | Renderer **fallback** used only outside Electron (tests / browser preview). Public — embedded in the bundle when set.                                                                                                        |

> Never point a packaged build at localhost. Nexconn/DB/session secrets stay in `apps/api/.env`
> and must never appear in a desktop or renderer-reachable variable.

### `apps/api/.env` (server-side; secrets live here only)

| Variable                                | Purpose                                                                         | Phase         |
| --------------------------------------- | ------------------------------------------------------------------------------- | ------------- |
| `NODE_ENV`                              | `development` locally.                                                          | 0             |
| `PORT`                                  | HTTP port for the API.                                                          | 0             |
| `DATABASE_URL`                          | PostgreSQL connection string (Prisma).                                          | DB phase      |
| `CORS_ORIGIN`                           | Allowed client origin(s) (the desktop renderer origin).                         | 0/1           |
| `SESSION_SECRET`                        | Session signing secret.                                                         | Auth phase    |
| `NEXCONN_APP_ID` / `NEXCONN_APP_SECRET` | Nexconn server credentials for identity/token minting. **Never in the client.** | Nexconn phase |
| `AI_PROVIDER` / `AI_API_KEY`            | Provider-independent AI config. **Server-side only.**                           | AI phase      |

### Renderer public variables (`VITE_` prefix is exposed to the bundle)

| Variable              | Purpose                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`   | Renderer **fallback** API base, used only outside Electron (tests / browser preview); see the `apps/desktop/.env` table above.    |
| `VITE_NEXCONN_APP_ID` | Public Nexconn app identifier for the client SDK (NOT a secret; the secret stays in the API). Confirm exact name in Nexconn docs. |

> Do not prefix any secret with `VITE_`. `.env`, `.env.local` and `.claude/settings.local.json`
> are gitignored. Only `.env.example` (placeholders) is committed.

## Tooling checks

```bash
pnpm lint         # ESLint
pnpm format:check # Prettier
pnpm typecheck    # tsc --noEmit
pnpm test         # Vitest
```

## Agent environment (Phase 0)

Impeccable is installed at project scope under `.claude/` (skills, agents, engine, hooks in
`settings.local.json`). Project skills live in `.claude/skills/*`. `/impeccable init` establishes
design context; product truth is captured in `PRODUCT.md`.
