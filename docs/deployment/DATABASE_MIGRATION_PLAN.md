# PostgreSQL and Prisma Migration Plan

## Current repository state

- PostgreSQL is the only Prisma provider. There are **8** committed migration directories, ordered:

  1. `20261103175232_init_identity_workspaces`
  2. `20261104015557_add_nexconn_communication`
  3. `20261104055810_add_projects`
  4. `20261104073845_add_task_management`
  5. `20261104093318_add_decision_vault`
  6. `20261104104500_decision_vault_lifecycle_and_ownership`
  7. `20261105042725_add_execution_intelligence`
  8. `20261106000000_add_clerk_identity`

- The schema models identity, sessions, workspaces/memberships/invitations, projects/tasks,
  decisions, execution-intelligence records, and Nexconn identity/conversation/webhook metadata.
  Message bodies and transport state are not duplicated in PostgreSQL.
- Prisma 7 keeps the datasource URL out of `schema.prisma`; `apps/api/prisma.config.ts` loads
  `DATABASE_URL` for CLI operations. Runtime uses one module-level `PrismaClient` with
  `@prisma/adapter-pg` and `pg` through `PrismaPg`.
- There is no configured seed script. `DATABASE_URL` is required at app boot. The same variable is
  currently used by migration CLI and runtime; there is no separate direct/pooled URL model.
- No production database was contacted. `prisma migrate status`, `migrate deploy`, schema diff,
  backups, and restore were **not** run.

## Destructive loose SQL file — do not run

`apps/api/prisma/tmp_rebaseline_decision_vault.sql` is outside the migrations directory, so Prisma
does not run it automatically. It drops six Decision Vault tables and five enum types with `CASCADE`
and deletes a row from `_prisma_migrations`. Its comments claim those tables were empty, but that
claim has not been checked against any target database. Treat this file as destructive and
**BLOCKED from use** until its history and purpose are reviewed. It must never be part of Railway's
pre-deploy command.

The eight committed migration SQL files contain no `DROP TABLE` or `DROP COLUMN` statement in the
source scan. The Clerk migration does drop `NOT NULL` from `passwordHash` (a widening change, not a
column removal). That does not prove the migrations match any existing database or that the loose
SQL file is safe.

## Safe first-deployment plan

1. Identify whether the Railway database will be new/empty or contain any data. Do not assume it is
   empty. If it contains data, capture `pg_dump` and verify a restore into a separate staging DB
   before touching it.
2. Enable/configure Railway PostgreSQL backup and recovery options before storing production data;
   document retention, owner, and restore procedure. Railway's basic PostgreSQL deployment is a
   single node; HA, backups, point-in-time recovery, and pooling are separately configured options.
3. For an empty database, deploy only the committed history with
   `pnpm --filter @buildtogether/api exec prisma migrate deploy` from the repository root, after
   the API build/runtime blocker is fixed. Run this once as Railway's pre-deploy job, not from every
   API replica's startup command.
4. For a pre-existing database, compare `_prisma_migrations` and actual schema with the 8 committed
   migrations using a restored staging copy first. Do not `migrate resolve`, baseline, or reapply
   by guess. Write and review a specific recovery/baseline plan before production changes.
5. After migration, run read-only schema checks and application smoke tests. Do not use `prisma db
push` or `migrate dev` against production.
6. Keep a verified pre-deployment backup and rollback procedure for every future destructive or
   data-transforming release.

## Connection capacity

The adapter constructs `new PrismaPg({ connectionString })` without explicit pool sizing or
timeouts. Prisma 7 uses the underlying `pg` pool for adapter connections; configure and validate
pool limits/timeouts against Railway's database connection limit and maximum API replica count before
scaling. Keep the PostgreSQL service private to the Railway project; use Railway's private
`DATABASE_URL` reference rather than enabling public database networking for the API.

**Status: NEEDS USER ACTION / NEEDS IMPLEMENTATION.** Database existence, state, backups, restore,
connection budget, and live migration status are unknown. No database change was made.
