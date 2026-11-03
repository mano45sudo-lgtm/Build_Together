# Environment Setup

Prerequisites and steps to run BuildTogether locally. Placeholders only — never commit real
secrets.

## Prerequisites

| Tool       | Version                         | Notes                                          |
| ---------- | ------------------------------- | ---------------------------------------------- |
| Node.js    | ≥ 20 LTS (repo verified on v24) | Required by Vite 8 / tooling.                  |
| pnpm       | ≥ 9 (repo verified on 11.x)     | Package manager; workspaces rely on it.        |
| Git        | any recent                      | Conventional Commits.                          |
| PostgreSQL | 15+                             | Local or container for the API in data phases. |

Verify: `node -v; pnpm -v; git --version`.

## First-time setup

```bash
pnpm install                      # install all workspace deps (run at repo root)
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
# fill apps/api/.env with local values (see variable table below)
pnpm dev                          # web + api together
```

Run individually: `pnpm --filter @buildtogether/web dev` ·
`pnpm --filter @buildtogether/api dev`.

## PostgreSQL (for data phases)

Point `DATABASE_URL` at a local/dev database, then:
`pnpm --filter @buildtogether/api prisma:migrate` and `prisma:generate`. No schema exists in
Phase 0; these commands become live when the database phase is authorized.

## Environment variables

### `apps/api/.env` (server-side; secrets live here only)

| Variable                                | Purpose                                                                  | Phase         |
| --------------------------------------- | ------------------------------------------------------------------------ | ------------- |
| `NODE_ENV`                              | `development` locally.                                                   | 0             |
| `PORT`                                  | HTTP port for the API.                                                   | 0             |
| `DATABASE_URL`                          | PostgreSQL connection string (Prisma).                                   | DB phase      |
| `CORS_ORIGIN`                           | Allowed web origin(s).                                                   | 0             |
| `SESSION_SECRET`                        | Session signing secret.                                                  | Auth phase    |
| `NEXCONN_APP_ID` / `NEXCONN_APP_SECRET` | Nexconn server credentials for identity/token minting. **Never in web.** | Nexconn phase |
| `AI_PROVIDER` / `AI_API_KEY`            | Provider-independent AI config. **Server-side only.**                    | AI phase      |

### `apps/web/.env` (public — `VITE_` prefix is exposed to the bundle)

| Variable              | Purpose                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`   | Base URL of `apps/api` (e.g. `http://localhost:4000`).                                                                            |
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
