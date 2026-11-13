# syntax=docker/dockerfile:1.7
#
# Cue API image. Build context MUST be the repository root: the pnpm lockfile, workspace manifest
# and the @buildtogether/shared package live there.
#
#   docker build -t cue-api .
#   docker run --rm -p 4000:4000 --env-file <private env file> cue-api
#
# Stages
#   os      Node 24 (Debian bookworm, glibc) + OpenSSL + CA certificates. Shared by build and runtime.
#   base    os + pnpm 11.8.0 via Corepack (build tooling only).
#   build   Frozen, filtered workspace install; shared build → Prisma generate → API compile; then
#           `pnpm deploy --prod` into a self-contained directory and generate the Prisma client there.
#   runtime os + the deployed directory, owned by the unprivileged `node` user. No pnpm/Corepack.
#
# The Prisma CLI is a runtime dependency on purpose: the eventual release step runs
# `prisma migrate deploy` from this same image. This image never runs migrations by itself.

ARG NODE_VERSION=24
ARG PNPM_VERSION=11.8.0

# ---------------------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS os
# OpenSSL: Prisma's schema engine (used by `prisma migrate deploy`) links against libssl.
# ca-certificates: system trust store for outbound TLS (Clerk, Nexconn, verify-full PostgreSQL).
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------------------------
FROM os AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# ---------------------------------------------------------------------------------------------
FROM base AS build
WORKDIR /repo

# 1) Manifests only, so dependency installation is cached until a manifest or the lockfile changes.
#    The desktop manifest is copied only so the frozen lockfile matches the workspace; the filtered
#    install never installs desktop dependencies.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/desktop/package.json apps/desktop/

# 2) Install the API and its workspace dependencies (`...` includes @buildtogether/shared).
#    Network is required here: the npm registry, Prisma engine binaries for linux/openssl-3, and the
#    Nexconn SDK, a pinned GitHub tarball (codeload.github.com) built by its `prepare` script.
#    Any native package resolves its linux-x64-gnu build because this install runs on Linux.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store \
 && pnpm install --frozen-lockfile --filter "@buildtogether/api..."

# 3) Sources, then build: shared package first (the API build script does this), Prisma client,
#    API TypeScript (NodeNext ESM) to apps/api/dist.
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/
RUN pnpm --filter @buildtogether/api prisma:generate \
 && pnpm --filter @buildtogether/api build

# 4) Self-contained production directory: prod dependencies only, workspace package copied in.
#    `--legacy`: pnpm 10+ otherwise requires inject-workspace-packages across the whole workspace,
#    which would change how local development links @buildtogether/shared.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @buildtogether/api deploy --prod --legacy /out

# 5) Make sure the compiled output, the shared package's build and the Prisma files are present
#    (deploy honours ignore files, which exclude build output), drop sources the runtime never
#    reads (keeping the two TypeScript modules prisma.config.ts imports), and generate the Prisma
#    client inside the deployed node_modules.
RUN rm -rf /out/dist /out/node_modules/@buildtogether/shared/dist \
 && cp -r apps/api/dist /out/dist \
 && cp -r packages/shared/dist /out/node_modules/@buildtogether/shared/dist \
 && rm -rf /out/prisma /out/src /out/.env* /out/vitest*.config.ts /out/tsconfig*.json \
 && cp -r apps/api/prisma /out/prisma \
 && mkdir -p /out/certs && cp apps/api/certs/rds-global-bundle.pem /out/certs/ \
 && cp apps/api/prisma.config.ts /out/prisma.config.ts \
 && mkdir -p /out/src/lib \
 && cp apps/api/src/lib/database-config.ts apps/api/src/lib/runtime-environment.ts /out/src/lib/ \
 && rm -rf /out/node_modules/@buildtogether/shared/src \
 && cd /out && ./node_modules/.bin/prisma generate

# ---------------------------------------------------------------------------------------------
FROM os AS runtime
# NPM_CONFIG_UPDATE_NOTIFIER: `npm run db:migrate:deploy` (the release step) should not phone home.
ENV NODE_ENV=production \
    PORT=4000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
COPY --from=build --chown=node:node /out /app
USER node
EXPOSE 4000
# Exec form: node is PID 1 and receives SIGTERM/SIGINT directly, so the API's graceful shutdown
# (drain HTTP, then disconnect Prisma) runs instead of being cut short by a wrapper process.
STOPSIGNAL SIGTERM
CMD ["node", "dist/index.js"]
