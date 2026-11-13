# Cue Database Deployment — Prisma Migrations and TLS (Batch 0B)

Status 2026-11-08. Validated locally against a disposable, TLS-only PostgreSQL 16 through the
`cue-api:batch0b` image. No Railway, AWS or production database was touched.

## Migration command

| Item           | Value                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| API script     | `db:migrate:deploy` → `prisma migrate deploy` (`apps/api/package.json`)                                            |
| In the image   | `npm run db:migrate:deploy` (WORKDIR `/app`; npm ships with Node; no pnpm in the runtime image)                    |
| Config         | `apps/api/prisma.config.ts` → `DATABASE_URL` + `DATABASE_SSL_MODE` / `DATABASE_SSL_ROOT_CERT` from the environment |
| Never in prod  | `prisma migrate dev` (`prisma:migrate` script) — development only                                                  |
| Not at startup | `CMD ["node", "dist/index.js"]`; no API runtime code calls Prisma Migrate                                          |

`prisma.config.ts` imports `dotenv/config`, which loads a `.env` from the working directory. The
image contains none (`.dockerignore` excludes `.env*`), so the CLI uses only platform variables. The
CLI prints the target (`Datasource "db": … database "<name>" … at "<host>:<port>"`) before acting —
check it in deploy logs.

## Execution order (Railway)

1. Build the root `Dockerfile` (context = repository root).
2. **Pre-deploy command:** `npm run db:migrate:deploy`. Railway runs it in a separate container from
   the built image, with the service's variables and private network, no volumes, after the build and
   before the new deployment receives traffic. Non-zero exit → the deploy does not proceed and it is
   not retried. Set the Pre-deploy Timeout (1–3600 s; default unlimited), e.g. 600 s.
3. Start the API (`node dist/index.js`); health check `/api/v1/health/ready`.

Consequences to plan for:

- The previous deployment keeps serving while pre-deploy migrates. Every migration must be backward
  compatible with the running release (expand → deploy → contract).
- A failed migration is recorded as failed in `_prisma_migrations` and blocks later deploys until it
  is inspected and resolved (`prisma migrate resolve`) — there is no automatic database rollback.
  Take a backup before any release that migrates.
- `prisma migrate deploy` takes a PostgreSQL advisory lock, so concurrent deploys serialise.
- Run migrations from exactly one place (pre-deploy). Never from each replica's startup.

## Connection pooling

| Path               | Connections                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| API runtime (`pg`) | `DATABASE_POOL_MAX` per replica (default 5, bounded 1–20), connect timeout 5 s, idle 10 s                                     |
| Prisma CLI         | Its own short-lived connection(s) plus an advisory lock, only during pre-deploy                                               |
| Budget             | `pool max × replicas + migration + admin headroom ≤ max_connections` (Railway's limit NOT VERIFIED; the image default is 100) |

No pooler is used, so one direct `DATABASE_URL` serves both paths. If a transaction-mode pooler
(PgBouncer) is introduced, migrations need a separate direct URL (advisory locks, session state);
that requires a reviewed change to `prisma.config.ts`.

## TLS

### Finding: Prisma Migrate ignored `verify-full` (fixed)

The runtime `pg` driver and the Prisma CLI's Rust schema engine are different TLS clients. Measured
against a TLS-only server whose certificate is signed by a throwaway private CA
(SAN `localhost`, `cue-mig-pg`):

| Case                                | Runtime `pg` (`/health/ready`) | CLI before fix     | CLI after fix                                             |
| ----------------------------------- | ------------------------------ | ------------------ | --------------------------------------------------------- |
| `verify-full` + CA + host in SAN    | 200                            | connected          | connected                                                 |
| `verify-full`, no CA file           | 503 (rejected)                 | **connected**      | rejected — "self-signed certificate in certificate chain" |
| `verify-full` + CA, host not in SAN | 503 (rejected)                 | **connected**      | rejected — "hostname mismatch"                            |
| Plaintext                           | —                              | rejected by server | rejected by server                                        |

Before the fix, migrations ran encrypted but **unauthenticated** (open to interception) even though
the config said `verify-full`: the schema engine does not implement libpq's `verify-full` /
`sslrootcert`. Fix: `resolveMigrationConnectionString()` (`apps/api/src/lib/database-config.ts`),
used only by `prisma.config.ts`, translates `verify-full` into the engine's strict mode
`sslmode=require&sslaccept=strict&sslcert=<DATABASE_SSL_ROOT_CERT>` (`sslcert` is Prisma's name for
the trusted root, not a client certificate). Without a CA path, strict mode uses the system trust
store. The runtime resolver is unchanged. Production still refuses to start without `verify-full`.

### Railway PostgreSQL — what is established

- Railway's docs do not describe PostgreSQL TLS, certificates or `sslmode`. They state the database
  uses Railway's "SSL-enabled Postgres image" and that private networking runs over encrypted
  WireGuard tunnels with `<service>.railway.internal` names (IPv4+IPv6 for environments created after
  2025-10-16; IPv6-only for older ones).
- The image source (`railwayapp-templates/postgres-ssl`, `init-ssl.sh` / `wrapper.sh`, main branch):
  - generates a **private root CA** (`CN=root-ca`) that signs the server certificate (`CN=localhost`);
  - server SANs: `DNS:localhost` plus `DNS:${RAILWAY_PRIVATE_DOMAIN}` when that variable is set; **no
    public TCP-proxy hostname**, so `verify-full` through the public proxy cannot succeed;
  - `ssl = on`, but `pg_hba` uses `host` (not `hostssl`): TLS is offered, not enforced server-side;
  - certificates last 820 days (`SSL_CERT_DAYS`) and are regenerated on restart within 30 days of
    expiry — **including a new root CA**, which breaks any pinned CA;
  - regeneration only checks for `DNS:localhost`, so an older volume may lack the private hostname;
  - the CA lives on the database volume (`/var/lib/postgresql/data/certs/root.crt`); no documented
    export command.

### Requirements for `verify-full` on Railway

1. Connect over the private network using the exact hostname present in the server certificate's
   SAN (expected `postgres.railway.internal` / `RAILWAY_PRIVATE_DOMAIN`). Not the public proxy.
2. Obtain the root CA through an authenticated channel (shell on the database service), never over an
   unverified connection, and record its fingerprint.
3. Make the CA available as a file at `DATABASE_SSL_ROOT_CERT` in **both** the API container and the
   pre-deploy container. **Open gap:** Railway variables are strings and pre-deploy mounts no
   volumes; the API accepts only a file path. Proposed design (not yet implemented): see
   "CA delivery design" below.
4. Plan CA rotation (every ≤ 820 days, or on any regeneration): update the trusted CA before or with
   the database restart, or the API and migrations will refuse to connect.

### CA delivery design (Batch 0D-A — proposed, NOT implemented)

**Problem.** `DATABASE_SSL_ROOT_CERT` must be an absolute file path, read by two separate processes:
the API (`src/index.ts` → `env.ts` → `prisma.ts`) and, in the pre-deploy container, the Prisma CLI
(`prisma.config.ts`). Railway variables are strings, and the pre-deploy container mounts no
volumes, so neither process can be handed a file by the platform.

**Options considered.**

| Option                                                      | Verdict                                                                                                   |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Bake the CA into the image                                  | Rejected: makes the image environment-specific; every rotation needs a rebuild; leaks across environments |
| Railway volume holding the CA                               | Rejected: pre-deploy containers have no volumes, so migrations could not use it                           |
| Point `DATABASE_SSL_ROOT_CERT` at the database's own volume | Impossible: the API container cannot read another service's volume                                        |
| Relax to `require` / accept invalid certificates            | Rejected: weakens TLS (forbidden)                                                                         |
| **PEM in a variable, written to a private file at startup** | **Recommended**                                                                                           |

**Recommended mechanism.**

1. New variable `DATABASE_SSL_ROOT_CERT_PEM` holding the PEM text (one or more `CERTIFICATE` blocks).
   It is public trust material, not a secret, but integrity-critical: whoever can edit it decides
   which server is trusted — the same privilege level as `DATABASE_URL`, so keep it in the same
   restricted variable set.
2. One small dependency-free module (e.g. `src/lib/database-ca.ts`) called **first** by both entry
   points — imported at the top of `src/index.ts` (after the `.env` loader) and of `prisma.config.ts`
   — so both processes derive the file from the same variable:
   - if `DATABASE_SSL_ROOT_CERT_PEM` is unset, do nothing (existing file-path behaviour unchanged);
   - if both it and `DATABASE_SSL_ROOT_CERT` are set, refuse to start (ambiguous trust source);
   - parse every block with `node:crypto` `X509Certificate`; refuse if none parses, if any is
     expired or not yet valid, or if a block is not a CA certificate; never log the PEM — log only
     each certificate's SHA-256 fingerprint and expiry;
   - create a fresh directory with `fs.mkdtemp` under `os.tmpdir()` (mode `0700`, owned by the
     `node` user), write `ca.pem` with mode `0600`, then set `process.env.DATABASE_SSL_ROOT_CERT` to
     that absolute path before `env.ts` / `loadDatabaseSettings` run.
3. The image ships the new module next to `prisma.config.ts` (same Dockerfile copy step as
   `database-config.ts` and `runtime-environment.ts`).

**Lifetime and cleanup.** The file lives only in the container's ephemeral filesystem; every
restart and every pre-deploy run recreates it from the variable, so nothing stale survives a
redeploy. Removing it on graceful shutdown is optional hygiene, not a security boundary.

**Rotation.** Updating the variable on Railway triggers a redeploy, so both containers pick up the
new CA together. For a planned rotation, set a bundle containing the old and new CA, let it deploy,
rotate the database certificate, then remove the old CA. Node's TLS accepts a multi-certificate CA
file; **the Prisma schema engine's handling of a bundle in `sslcert` is NOT VERIFIED** and must be
tested before relying on overlap. Railway's image regenerates its CA on restart within 30 days of
expiry, so track the CA expiry (logged fingerprint and date) and rotate deliberately beforehand.

**Tests to add with the implementation.** Unset variable → no-op; both variables set → refused;
malformed PEM, expired or non-CA certificate → refused; file created with `0600` in a `0700`
directory; `DATABASE_SSL_ROOT_CERT` points at it; both `env.ts` and `prisma.config.ts` paths resolve
the same file; the PEM never appears in logs or errors. Then repeat the Batch 0B TLS matrix (correct
CA passes; no CA, wrong CA and wrong hostname fail) for both the API and the CLI.

**Still external.** The real Railway certificate SANs, the CA export procedure and CA regeneration
behaviour must be verified against an actual Railway database in a later, approved phase.

### Live Railway verification plan (requires approval; not executed)

In a disposable Railway project/environment, with the image built from this repository:

1. Provision PostgreSQL from Railway's template; record the image version.
2. From the database service shell, inspect `server.crt` (subject, issuer, SANs, validity) and copy
   `root.crt`; record its SHA-256 fingerprint.
3. Confirm the private hostname resolves and appears in the SAN.
4. Run the matrix above for both clients: runtime (`/api/v1/health/ready`) and CLI
   (`prisma migrate status`): correct CA + private host → success; no CA → fail; CA + public proxy
   host → fail; plaintext attempt → note whether the server accepts it (it is expected to).
5. Run `npm run db:migrate:deploy` as the pre-deploy command on the empty database; confirm the
   8 rows in `_prisma_migrations`, `migrate status` up to date, `migrate diff` against
   `schema.prisma` reports no difference.
6. Restart the database service and confirm the certificate is unchanged (no surprise rotation).
7. Delete the disposable project.

## Local validation evidence (2026-11-08)

Disposable `postgres:16-alpine` on a private Docker network (no published ports), TLS-only
`pg_hba`, empty `cue_migration_check` database, random password never printed. Through the image
with `NODE_ENV=production`, `DATABASE_SSL_MODE=verify-full`, `DATABASE_SSL_ROOT_CERT`:

- `npm run db:migrate:deploy`: 8 migrations applied in order; re-run: "No pending migrations".
- `_prisma_migrations`: 8 rows, all finished, none rolled back, no logs; checksums equal the
  SHA-256 of the committed `migration.sql` files.
- `prisma migrate status`: up to date. `prisma validate`: valid. `prisma migrate diff
--from-config-datasource --to-schema prisma/schema.prisma --exit-code`: no difference.
- Schema: 21 application tables (21 models) + `_prisma_migrations`, 19 enums (19 in schema), 91
  indexes, 41 foreign keys, `User.clerkUserId` unique; zero application rows.
- Removed afterwards: container, data volume, certificate volume, network, password file.
  The development database (`bt-postgres`) was not touched.
