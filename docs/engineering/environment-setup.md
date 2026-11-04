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

## PostgreSQL (required from Phase 2)

The API needs a running PostgreSQL for auth + workspaces. Local dev uses a Docker container
(`bt-postgres`, `postgres:16-alpine`, `buildtogether`/`buildtogether` on `127.0.0.1:5432`):

```bash
docker run -d --name bt-postgres -e POSTGRES_USER=buildtogether -e POSTGRES_PASSWORD=buildtogether \
  -e POSTGRES_DB=buildtogether -p 5432:5432 postgres:16-alpine
```

Point `DATABASE_URL` at it, then apply the committed migration and generate the client:
`pnpm --filter @buildtogether/api prisma:migrate` (uses `prisma.config.ts` + the
`@prisma/adapter-pg` driver) and `prisma:generate`. The identity/workspace schema
(`User`/`Session`/`Workspace`/`WorkspaceMembership`/`WorkspaceInvitation`) ships as migration
`20261103175232_init_identity_workspaces`; the Phase 3 communication-metadata models
(`NexconnUserMapping`/`WorkspaceConversation`/`ConversationParticipant`/`NexconnWebhookEvent`) ship
as the additive, non-destructive migration `20261104015557_add_nexconn_communication`. The
integration tests run against this database.

## Environment variables

### `apps/desktop/.env`

| Variable            | Purpose                                                                                                                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BT_API_BASE_URL`   | API base resolved by the trusted **main** process and handed to the renderer over IPC. Environment-aware; leave unset for built-in dev (`http://localhost:4000`) / packaged prod (`https://api.buildtogether.app`) defaults. |
| `VITE_API_BASE_URL` | Renderer **fallback** used only outside Electron (tests / browser preview). Public — embedded in the bundle when set.                                                                                                        |

> Never point a packaged build at localhost. Nexconn/DB/session secrets stay in `apps/api/.env`
> and must never appear in a desktop or renderer-reachable variable.

### `apps/api/.env` (server-side; secrets live here only)

| Variable                                                      | Purpose                                                                                          | Phase    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------- |
| `NODE_ENV`                                                    | `development` locally.                                                                           | 0        |
| `PORT`                                                        | HTTP port for the API.                                                                           | 0        |
| `DATABASE_URL`                                                | PostgreSQL connection string (Prisma adapter). **Required (Phase 2+).**                          | 2        |
| `CORS_ORIGIN`                                                 | Allowed client origin(s) (the desktop renderer origin).                                          | 0/1      |
| `SESSION_SECRET`                                              | Session value-derivation secret; strong random in prod (fail-closed).                            | 2        |
| `ACCESS_TOKEN_TTL_SECONDS`                                    | Opaque access-token lifetime (default 900 ≈ 15 min).                                             | 2        |
| `REFRESH_TOKEN_TTL_SECONDS`                                   | Opaque refresh-token lifetime (default 2592000 ≈ 30 d).                                          | 2        |
| `INVITATION_TTL_SECONDS`                                      | Invitation expiry (default 604800 ≈ 7 d).                                                        | 2        |
| `AUTH_RATE_LIMIT` / `INVITE_RATE_LIMIT`                       | Rate-limit ceilings for auth / invitation endpoints.                                             | 2        |
| `PUBLIC_APP_BASE_URL`                                         | Base URL for invitation accept links (dev transport).                                            | 2        |
| `CHAT_RATE_LIMIT`                                             | Ceiling for chat management calls (token mint / conversation create / member ops) per 5 min.     | 3        |
| `NEXCONN_APP_KEY`                                             | Nexconn **public** app identifier. Echoed to the desktop so Web IMLib can `init`; NOT a secret.  | 3        |
| `NEXCONN_APP_SECRET`                                          | Nexconn server secret — mints tokens + verifies callbacks. **Server-only, never in the client.** | 3        |
| `NEXCONN_PRIMARY_API_DOMAIN` / `NEXCONN_SECONDARY_API_DOMAIN` | Optional server-API endpoint overrides (SDK defaults when unset).                                | 3        |
| `NEXCONN_TOKEN_TTL_SECONDS`                                   | Lifetime of the client token minted for the desktop (default 3600).                              | 3        |
| `NEXCONN_WEBHOOK_MAX_SKEW_MS`                                 | Accepted clock skew for provider callbacks (replay window, default 300000).                      | 3        |
| `SMTP_URL` (optional)                                         | Transactional email provider; unset ⇒ clearly-labelled **dev transport**.                        | 2        |
| `AI_PROVIDER` / `AI_API_KEY`                                  | Provider-independent AI config. **Server-side only.**                                            | AI phase |

> Nexconn needs **no `VITE_` variable**: the client App Key is delivered at runtime inside the
> short-lived token the backend mints over IPC (see ADR-0004), and the App Secret never leaves the
> API. Message transport goes renderer→Nexconn directly; conversation metadata + authorization go
> renderer→main→API.

### Renderer public variables (`VITE_` prefix is exposed to the bundle)

| Variable            | Purpose                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `VITE_API_BASE_URL` | Renderer **fallback** API base, used only outside Electron (tests / browser preview); see the `apps/desktop/.env` table above. |

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
