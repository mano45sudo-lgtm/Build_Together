# Cue Database Production Readiness and Migration Plan

## Audit scope and decision

**Phase 3 was inspection and documentation only. Phase 3.1 is local code/configuration remediation
and documentation only.** No database was connected to, provisioned,
backed up, migrated, reset, or modified. No migration status command was run because it requires a
database connection. No SQL file was executed. This is a repository audit, not evidence that an
unknown database matches the repository.

**Production database decision: NO-GO.** The migration set is understandable and contains no table
or column drops, but production state, history, backup/restore capability, replica connection
budget, Railway TLS behavior, and live startup remain unverified. Phase 3.1 adds bounded local
readiness, explicit pool/TLS configuration, graceful shutdown, and quarantines the loose SQL; it
does not establish production readiness.

## Actual Prisma architecture

- `apps/api/prisma/schema.prisma` declares PostgreSQL and the default `prisma-client-js` generator.
  Under the current schema there are 21 models and 19 enums. The schema has no datasource URL;
  Prisma 7 reads it from `apps/api/prisma.config.ts`.
- `prisma.config.ts` imports `dotenv/config`, points to `prisma/schema.prisma` and
  `prisma/migrations`, and supplies the TLS-resolved `DATABASE_URL` to Prisma CLI operations. The
  committed migration lock declares `provider = "postgresql"`.
- `apps/api/package.json` pins Prisma and `@prisma/client` to the 7.10-compatible range and
  includes `@prisma/adapter-pg` and `pg`. `prisma:generate` runs `prisma generate`.
- Runtime creates one module-level `PrismaClient` in `src/lib/prisma.ts`, passing the resolved
  `DATABASE_URL` and explicit node-postgres pool options to `PrismaPg`. The CLI and runtime share
  the URL and TLS resolver in `src/lib/database-config.ts`; there is no direct-vs-pooled URL split.
- Pool defaults are max 5 clients per API process, 5-second connection timeout and 10-second idle
  timeout. Validated environment overrides are `DATABASE_POOL_MAX` (1–20),
  `DATABASE_CONNECTION_TIMEOUT_MS` (100–30000), and `DATABASE_IDLE_TIMEOUT_MS` (1000–300000).
  Budget the configured maximum multiplied by the maximum API replica count, plus migration/admin
  connections. The replica ceiling and database connection allowance remain decisions to make.
- The adapter accepts `pg.PoolConfig`, and Cue now configures pool and timeout fields there. TLS
  uses `DATABASE_SSL_MODE=disable|verify-full`; development defaults to `disable`, while production
  requires explicit `verify-full`. Optional `DATABASE_SSL_ROOT_CERT` supplies a CA file path.
  `verify-full` verifies both certificate chain and hostname; no `rejectUnauthorized: false` path
  exists. Connection-string TLS modes are normalized so they cannot silently weaken this setting.
  Railway private networking is encrypted between services, but the actual DB URL and PostgreSQL
  TLS policy still need verification in the authorized Railway environment. Avoid mixing an
  explicit `ssl` object with connection-string SSL fields without checking node-postgres semantics;
  do not add libpq-only URL options without checking `pg` behavior.
- `src/index.ts` now uses one idempotent shutdown path: stop accepting connections, allow HTTP
  drain up to 8 seconds, forcibly close remaining connections on deadline, then call
  `prisma.$disconnect()` with a 5-second bound. Live signal behavior remains to be verified in a
  running deployment.
- `/api/v1/health` remains process liveness. `/api/v1/health/ready` runs bounded `SELECT 1` through
  the Prisma singleton and returns sanitized 503 on database failure/timeout. No DB was contacted
  during implementation.
- There is no seed script or separate migration package. `prisma migrate deploy` applies committed
  migrations only; the package's `prisma:migrate` script is `prisma migrate dev` and is for
  development, not production.

Railway's documented private `DATABASE_URL`/private service reference is compatible in principle
with this TCP `pg` adapter when the API and Postgres service share the same Railway project and
environment. This is a code-and-platform compatibility finding, not a successful live connection
test. Railway documents private DNS and encrypted private networking; it also documents that the
default Postgres service is single-node, with HA, backups/PITR and pooling as separately configured
options. Sources: [Railway PostgreSQL](https://docs.railway.com/databases/postgresql),
[Railway private networking](https://docs.railway.com/networking/private-networking), and
[Railway private service connections](https://docs.railway.com/databases/build-a-database-service).

### Pooling and migration URLs

No pooler is present in this repository. For a direct Railway PostgreSQL URL, a separate
`DIRECT_URL` is not inherently required: the current same-variable arrangement can work if the
database connection budget accommodates the `pg` pool. Keep migrations in a one-shot pre-deploy
job, never in every API replica's startup command.

If a transaction-mode pooler such as PgBouncer is introduced, runtime and migration URLs should be
separated: runtime through a correctly configured pooler; Prisma Migrate through a direct database
connection. The current `prisma.config.ts` always reads `DATABASE_URL`, so that CLI split would
require a separately approved configuration change. Prisma documents the direct-URL workaround for
Migrate with PgBouncer; see [Prisma ORM 7 PgBouncer guidance](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/pgbouncer).

## Migration set and ordering

There are **8** migration directories, ordered lexicographically by timestamp. Dependencies follow
the preceding tables: identity/workspaces → Nexconn metadata → projects → tasks → Decision Vault →
Decision Vault lifecycle/ownership → intelligence/notifications → Clerk identity. All migrations
use PostgreSQL DDL. The audit below is from the SQL files, not from a live database.

| # / migration                                              | Purpose; enums and tables created                                                                                                                                                                                                                                            | Existing tables/columns changed; data backfill                                                                                                                                                                                                                                                    | Destructive operations; FK/index summary                                                                                                                                                                                                                                                                                                                                                               | Existing populated database assessment                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. `20261103175232_init_identity_workspaces`               | Initial identity/workspace baseline. Enums: `AccountStatus`, `WorkspaceRole`, `InvitationStatus`. Tables: `User`, `Session`, `Workspace`, `WorkspaceMembership`, `WorkspaceInvitation`.                                                                                      | None. `User.passwordHash` is required with no default, but the table is newly created by this migration.                                                                                                                                                                                          | No drops or row deletion. FKs: Session→User CASCADE; Workspace→creator RESTRICT; membership→Workspace/User CASCADE; invitation→Workspace CASCADE and inviter RESTRICT. Unique email, token hashes and workspace/user membership; indexes on status, session lookup/expiry, creator, membership and invitation query fields.                                                                            | Safe as the first migration on an empty database. Not safe to apply over an existing matching schema/data without verified Prisma history; it creates objects and has no data-preserving baseline logic.                                                                                                                                  |
| 2. `20261104015557_add_nexconn_communication`              | Enums: `ConversationKind`, `WebhookStatus`. Tables: `NexconnUserMapping`, `WorkspaceConversation`, `ConversationParticipant`, `NexconnWebhookEvent`.                                                                                                                         | None.                                                                                                                                                                                                                                                                                             | No drops or data backfill. FKs: mapping→User CASCADE; conversation→Workspace CASCADE and creator RESTRICT; participant→conversation/User CASCADE. Unique provider IDs, user mapping, conversation participant; indexes for workspace/kind, user, webhook type/time. JSONB webhook payload is persisted metadata, not chat message content.                                                             | Additive when migration 1 is correctly applied. Can fail on unexpected pre-existing objects or drift.                                                                                                                                                                                                                                     |
| 3. `20261104055810_add_projects`                           | Enums: `ProjectStatus`, `ProjectVisibility`. Table: `Project`.                                                                                                                                                                                                               | None.                                                                                                                                                                                                                                                                                             | No drops or backfill. FKs: workspace CASCADE; owner and creator User RESTRICT. Unique workspace/projectKey and workspace/slug; workspace/status/archive and owner indexes.                                                                                                                                                                                                                             | Additive when the preceding migration history is intact.                                                                                                                                                                                                                                                                                  |
| 4. `20261104073845_add_task_management`                    | Enums: `TaskStatus`, `TaskPriority`, `TaskActivityType`. Tables: `Task`, `TaskDependency`, `TaskActivity`.                                                                                                                                                                   | None.                                                                                                                                                                                                                                                                                             | No drops or backfill. FKs: Task→Workspace/Project CASCADE, creator RESTRICT, assignee SET NULL; dependency→either Task CASCADE; activity→Task CASCADE, actor RESTRICT. Unique dependency edge; indexes for workspace/project status and priority, assignee/due date, dependency prerequisite, activity task/time and scope.                                                                            | Additive when project/workspace/user history is intact. Cascades intentionally delete dependent task records if a parent workspace/project/task is deleted.                                                                                                                                                                               |
| 5. `20261104093318_add_decision_vault`                     | Enums: initial `DecisionStatus`, `DecisionSource`, `DecisionReferenceType`, `DecisionHistoryType`. Tables: `Decision`, `DecisionAlternative`, `DecisionReference`, `DecisionParticipant`, `DecisionComment`, `DecisionHistory`.                                              | None.                                                                                                                                                                                                                                                                                             | No drops or backfill. FKs: Decision→Workspace CASCADE; optional Project/Conversation/Task SET NULL; creator RESTRICT; superseded decision SET NULL. Alternatives/references/participants/comments/history cascade with Decision; participant user CASCADE; comment author/history actor RESTRICT. Indexes for workspace/status/project/date, source links, child timelines and participant uniqueness. | Creates Decision Vault empty on a valid prior schema. It is not safe to re-run if these tables/types already exist; the loose SQL file does not make such a re-run safe.                                                                                                                                                                  |
| 6. `20261104104500_decision_vault_lifecycle_and_ownership` | Creates `DecisionCategory`; no new tables. Renames `DecisionStatus` values `IN_DISCUSSION`→`PROPOSED`, `FINALIZED`→`APPROVED`; adds `REJECTED`. Renames `DecisionHistoryType.FINALIZED`→`APPROVED`; adds `REJECTED`, `OWNER_CHANGED`. Adds `DecisionReferenceType.DECISION`. | Adds `Decision.summary`, `category` (NOT NULL with `GENERAL` default), `rejectedAt`; renames `finalizedAt` to `approvedAt`; adds nullable `ownerId`, backfills every row from `createdById`, then makes it NOT NULL. Adds `DecisionAlternative.advantages`, `.disadvantages`, `.rejectionReason`. | No drops or row deletion. Adds workspace/category and workspace/owner indexes; Decision.ownerId→User RESTRICT FK. Enum renames preserve existing enum values; owner backfill updates every existing Decision row.                                                                                                                                                                                      | Data-preserving for rows produced by migration 5 because `createdById` is required and FK-backed. Backfill may be large/lock the table; NOT NULL/FK can fail if the target has drift, invalid creator data, or conflicting objects. No rollback script exists; reversing enum renames/data changes needs a separately designed migration. |
| 7. `20261105042725_add_execution_intelligence`             | Enums: `InsightKind`, `DismissalState`, `NotificationKind`, `NotificationEntityType`. Tables: `IntelligenceDismissal`, `Notification`.                                                                                                                                       | None.                                                                                                                                                                                                                                                                                             | No drops or backfill. FKs: dismissal→User CASCADE; notification→Workspace/User CASCADE; optional actor SET NULL. Unique dedup constraints and indexes for workspace/user/time, unread state and kind.                                                                                                                                                                                                  | Additive on intact earlier history. Workspace and recipient deletion cascades remove associated notifications/dismissals.                                                                                                                                                                                                                 |
| 8. `20261106000000_add_clerk_identity`                     | No enum or table creation.                                                                                                                                                                                                                                                   | Adds nullable `User.clerkUserId`; changes `User.passwordHash` from NOT NULL to nullable. No backfill: existing users remain `clerkUserId = NULL`, and password hashes are retained.                                                                                                               | No table/column drops or row deletion. Adds unique index on `User.clerkUserId`; PostgreSQL permits multiple NULLs in a standard unique index.                                                                                                                                                                                                                                                          | Additive and data-preserving on the expected User schema. Index creation can fail if non-NULL Clerk IDs already exist more than once or if target schema has drift.                                                                                                                                                                       |

### Ordering, transaction and rollback observations

- Timestamps establish the intended sequence; later DDL depends on earlier tables (notably migration
  6 requires migration 5's Decision objects and `createdById`). Apply only through Prisma Migrate,
  which reads the directory order and `_prisma_migrations` history.
- None of the eight SQL files contains an explicit whole-file `BEGIN`/`COMMIT`. Prisma ORM 7 does
  not automatically wrap PostgreSQL migrations in a single transaction. PostgreSQL DDL statements
  are transactional individually, but a failure partway through a file can leave earlier statements
  applied while the migration is recorded as failed. The risky practical case is a partial migration
  6: renamed enum values/added fields/backfill may have landed before a later index or FK fails.
  Inspect the exact state and use a reviewed recovery plan; do not blindly rerun or delete history.
  Prisma documents optional explicit transaction wrapping for PostgreSQL; if adopting it for future
  migrations, check all operations and server version compatibility first.
- `ALTER TYPE ... ADD VALUE` operations are in migration 6. The file does not use newly added values
  in a later statement in that same file. A failure can still leave a partially changed enum/schema.
- Normal `CREATE INDEX` statements are not `CONCURRENTLY`; they take locks while creating. The
  create-only migrations normally operate on new tables, but index creation on a populated/drifted
  database can block writes or fail on duplicate data.
- No rollback SQL is supplied. Do not invent a reverse script or assume `migrate resolve` reverses
  DDL. PostgreSQL backups/snapshots and forward corrective migrations are the recovery primitives;
  recovery is database-state-specific.
- The committed migration SQL has no `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, or `DELETE FROM`.
  Migration 8's `DROP NOT NULL` is a widening change, not removal of a column or its data.

## Loose destructive SQL file — quarantine before any database job

`tmp_rebaseline_decision_vault.sql` was moved from `apps/api/prisma/` to
`docs/quarantine/sql/` in Phase 3.1, outside `apps/api/prisma/` and Prisma's migration tree. The
quarantine README records its SHA-256 and forbids execution. Prisma Migrate does not auto-discover
or run it.
It is not referenced by a package script or current deployment command. It is named in this audit
document and the historical Phase 2 implementation log.

Statements inspected (not executed):

1. `DROP TABLE IF EXISTS ... CASCADE` for `DecisionHistory`, `DecisionComment`,
   `DecisionParticipant`, `DecisionReference`, `DecisionAlternative`, and `Decision`.
   This permanently removes any rows in those six tables, including decisions, alternatives,
   references, participants, comments and history. It also removes their table-owned indexes and
   constraints; `CASCADE` can remove other dependent database objects, if any.
   The migration-defined indexes removed include Decision workspace/status/project/date/source-link
   indexes, the alternative/reference/participant/comment/history indexes, the unique
   `(DecisionParticipant.decisionId, userId)` index, and the lifecycle migration's
   workspace/category and workspace/owner indexes. The removed FKs include Decision→Workspace,
   optional Project/Conversation/Task links, creator, superseding Decision and owner; child
   records→Decision; participant→User; comment→author; history→actor. Each table's primary-key
   constraint and declared unique constraints are dropped with that table.
2. `DROP TYPE IF EXISTS` for `DecisionHistoryType`, `DecisionReferenceType`, `DecisionSource`,
   `DecisionCategory`, and `DecisionStatus`.
3. `DELETE FROM "_prisma_migrations"` for migration
   `20261104093318_add_decision_vault`.

The header's assertion that the tables are empty is an unverified comment, not evidence. Deleting
the migration 5 history row does not undo later migrations 6–8, which are still recorded as applied.
It can therefore create out-of-order or inconsistent migration history and a database whose
objects do not match the migrations recorded as applied. A later `migrate deploy` may fail or may
recreate only an earlier schema while later history remains marked applied; exact behavior depends
on the target's migration table and current objects. Do not use this script as a re-baseline method.

**Safest prevention:** leave it unexecuted and exclude it from every command and deployment
artifact. It is now outside the active Prisma tree and has no script or deployment reference.
Require reviewed command allowlists and prohibit manual execution. Only the eight committed files under
`prisma/migrations/` belong in Prisma deployment.

## First deployment procedure

### A. New, empty production database

1. Provision the database only in the separately authorized deployment phase. Keep it private and
   in the same Railway project/environment as the API. Create a distinct production database; do
   not repurpose a development database.
2. Configure the API's secret `DATABASE_URL` as a Railway reference to the Postgres service's
   private connection URL. Do not paste it into source, logs, or command transcripts. Confirm the
   runtime and one-shot migration job receive the intended value.
3. Verify identity before any DDL: from a controlled secure session, query only the database name,
   server address/port and current user, compare with the intended production record, and verify the
   database has no application tables and no unexpected `_prisma_migrations` history. Never print
   the URL/password. `prisma migrate status` is a useful second check but is not a substitute for
   confirming the target identity.
4. Capture a pre-migration snapshot/backup if the provider supports it. For a genuinely empty DB,
   this is a recoverable baseline; it is not a substitute for post-migration backup policy.
5. Run `pnpm --filter @buildtogether/api exec prisma migrate status` and confirm exactly 8
   migrations are found and pending, with no failed or unexpected history. Review the eight SQL
   files and checksums from the release commit. Stop if anything differs.
6. Run `pnpm --filter @buildtogether/api exec prisma migrate deploy` once as a serialized
   pre-deploy/release job. Never run it from each API replica's startup command. Do not run
   `prisma migrate dev`, `prisma migrate reset`, `db push`, the loose SQL file, or a guessed
   `migrate resolve` operation against production.
7. Re-run `prisma migrate status`; confirm all 8 are applied and none failed. Read-only SQL checks
   should verify the expected migration names/count, tables, enum labels, foreign keys and indexes.
   Compare resulting schema against the committed schema using a reviewed read-only diff.
8. Start one API instance and verify startup plus `/api/v1/health/ready` (bounded database probe).
   Keep `/api/v1/health` as process liveness. Do not open user traffic until readiness succeeds.
9. Take a post-migration backup and confirm it is available. Re-enable/scale API traffic only after
   schema, startup and monitoring checks pass.

If migration fails, stop the release. Capture the Prisma error and migration status without exposing
credentials; take a snapshot of the current target if possible; inspect actual schema and failed
history on an isolated restore/staging copy first. Because migration files are not wrapped as one
transaction, determine which statements committed. Do not delete history or manually execute the
loose re-baseline script. If startup fails after migrations, keep user traffic disabled, fix the
application/configuration or restore to a separate database and perform a rehearsed cutback. A
restore over the only production database requires an explicit recovery decision and verified
backup.

### B. Existing database with data

Do not run the 8 migrations just because the schema appears similar. First take a verified backup,
restore it to an isolated database, inspect its identity/schema and `_prisma_migrations`, compare
the history checksums and schema with the exact release's eight migrations, then rehearse any
forward repair on the restored copy. If it was not created by this exact migration history, create a
separately reviewed baseline/adoption plan. No `migrate resolve`, manual migration row edits,
destructive cleanup or production migration is authorized by this audit.

## Backup and restore proposal (not approved policy)

These are proposed starting objectives for a small early-production service; the owner must approve
or revise them before data is stored:

| Control                  | Proposed target                                                                                                                                                               | Status                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Recovery Point Objective | At most 15 minutes of data loss; use point-in-time recovery if the selected Railway plan/configuration supports the target.                                                   | Proposed, not approved |
| Recovery Time Objective  | Restore service within 4 hours.                                                                                                                                               | Proposed, not approved |
| Backup frequency         | Continuous WAL/PITR if available plus at least one automated daily snapshot. Take an additional verified snapshot before each migration with material data/constraint impact. | Proposed, not approved |
| Retention                | Keep daily restore points for 30 days and monthly copies for 3 months; encrypt and restrict access. Confirm provider capabilities/cost.                                       | Proposed, not approved |
| Restore rehearsal        | Monthly and before high-risk changes; restore to an isolated database, never over production.                                                                                 | Proposed, not approved |
| Ownership/alerting       | Assign a named operations owner; alert on backup failures and age of last successful restore point.                                                                           | Decision needed        |

Restore rehearsal: restore the selected backup to a new isolated database/service; verify its
identity before connecting; run schema/migration-history checks; compare representative row counts
and business invariants with the source backup manifest; start a non-public API instance using the
restored database; verify read-only application flows; then destroy that isolated rehearsal target
only under its own approved cleanup procedure. Record elapsed restore time and data-loss point. This
does not authorize production restore or deletion.

## Current blockers / evidence not collected

- No Railway database was provisioned or contacted; production schema/history and whether the
  target would be empty or contain data are unknown.
- No production `migrate status`, deploy, schema diff, network, TLS, connection-capacity or restore
  test was run. A disposable local PostgreSQL 16.14 migration validation is recorded below; it is
  not evidence about a production database.
- API integration tests were not run. The disposable validation applied migrations and ran
  read-only schema/history checks only. Target production PostgreSQL version is unknown.
- No migration rollback scripts exist. Migrations are not whole-file transactional by default in
  the current Prisma ORM 7 workflow.
- Live Railway TLS, connection capacity, readiness, shutdown and schema behavior are still
  unverified. The local implementation now has explicit TLS/pool settings and bounded readiness;
  the deployment operator must choose a replica ceiling and verify the provider configuration.
- The destructive SQL is quarantined with a recorded SHA-256, is not executed, and has no active
  package/deployment reference.
- Backup plan and RPO/RTO are proposed only; provider plan/settings and named owner are unknown.
- Existing database adoption cannot be assessed without a backup-restored copy and verified history.

### Safe disposable-database validation (not performed in Phase 3.1)

The API integration harness requires an explicitly set `TEST_DATABASE_URL`; it does not fall back to
`DATABASE_URL`. Before running integration tests or migration rehearsal, an operator must create or
identify a separate disposable local PostgreSQL database, verify its server and database identity,
and confirm it contains no valuable data. Use a clearly test-only database name accepted by
`apps/api/src/test/database-safety.ts`, configure only `TEST_DATABASE_URL` for the test process, and
allow the harness's existing identity check to run before its cleanup. Do not point it at development,
staging, or production data. For migration rehearsal, use a newly created empty disposable database
and a separate explicit command after identity confirmation. Never run `migrate reset` as part of
this validation. No container, database, integration suite, migration status, or migration was run
in Phase 3.1. Phase 3.2 later performed a disposable migration validation as recorded below; it did
not run API integration tests or use `TEST_DATABASE_URL`.

## Phase 3.2 disposable migration validation

**Result: PASS on a disposable local database only. Production remains NO-GO.** The migration
directory contained exactly the eight expected, unchanged migrations. A newly created PostgreSQL
16.14 Docker container used a fresh dedicated database and user, a randomly assigned port bound to
`127.0.0.1` only, and container-only tmpfs storage. No host data volume was attached.

| Validation target              | Result                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Successful disposable database | `cue_migration_validation_20261107_125746_7d83a6`                                                                   |
| PostgreSQL / isolation         | PostgreSQL 16.14; Docker container; host mapping `127.0.0.1:59234`; tmpfs; dedicated user `cue_migration_validator` |
| Before migration               | Correct database/user verified; zero public tables and no `_prisma_migrations` table                                |
| `migrate deploy`               | All 8 migrations applied successfully in the expected order                                                         |
| `_prisma_migrations`           | Exactly 8 expected names; each has a finish time, no rollback timestamp and no error log                            |
| `migrate status`               | “Database schema is up to date”; 8 found, none pending                                                              |
| Prisma schema diff             | `No difference detected` using `--from-config-datasource --to-schema prisma/schema.prisma --exit-code`              |
| Integrity counts               | 21 application tables, 19 enums, 41 foreign keys, 48 unique constraints, 90 indexes; zero migration anomalies       |
| Decision Vault                 | All 6 tables and all 5 expected enums exist; `Decision.ownerId` is NOT NULL and `category` has default `GENERAL`    |
| Clerk/legacy identity          | `User.clerkUserId` and `User.passwordHash` are nullable, matching the Prisma schema                                 |
| Cleanup                        | Successful validation container and tmpfs removed; absence verified; earlier disposable attempts were also removed  |

The empty-schema diff verifies table and column definitions, primary keys, foreign keys and
referential actions, unique constraints, indexes, enum values, defaults and nullability against the
current Prisma schema. The SQL checks additionally counted key objects and inspected the specified
identity and Decision columns. No discrepancies were detected.

Migration 6 (`20261104104500_decision_vault_lifecycle_and_ownership`) ran successfully and produced
the required non-null `Decision.ownerId`. The database began empty, so its
`UPDATE Decision SET ownerId = createdById` backfill had zero existing rows; this run validates
migration execution and final schema, not the backfill against populated Decision data. No
application records were added.

Commands run against the temporary target (credentials omitted):

```text
docker run --name <unique-validation-container> --publish 127.0.0.1::5432 --tmpfs /var/lib/postgresql/data:rw,size=512m ... postgres:16-alpine
pnpm --filter @buildtogether/api exec prisma migrate deploy
pnpm --filter @buildtogether/api exec prisma migrate status
pnpm --filter @buildtogether/api exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
docker exec <validation-container> pg_isready ...
docker exec <validation-container> psql ... (identity, empty-state, migration history and read-only schema integrity queries)
docker rm --force --volumes <validation-container>
```

Two preliminary disposable attempts also applied all migrations but encountered validation-wrapper
issues after deployment (an obsolete Prisma diff option, then a PowerShell history-list expression).
Each temporary container was removed. The final fresh run above used the supported Prisma CLI
syntax and completed all checks. No migration failed and no migration SQL was edited. The three
phase-created containers/databases were:

- `cue_migration_validation_20261107_125457_1742a8` — removed after the obsolete diff option was
  rejected.
- `cue_migration_validation_20261107_125625_6adaea` — removed after the wrapper parsing error.
- `cue_migration_validation_20261107_125746_7d83a6` — full validation passed; removed and absence
  verified.

**Go/no-go:** NO-GO for production database migration or user traffic. Disposable migration
validation is complete but is not production evidence. A future go decision needs a confirmed empty
production target or rehearsed existing-database adoption plan, reviewed serialized migration job,
backup/restore rehearsal meeting approved RPO/RTO, replica/pool budget, verified Railway TLS,
successful live readiness/shutdown/schema/startup checks, and separate API integration verification
on a confirmed test database. Phase 3.2 did not access production or Railway.

## Sources consulted

- [Prisma ORM 7 migration commands](https://www.prisma.io/docs/orm/v7/reference/prisma-cli-reference)
- [Prisma ORM 7 development vs production migrations](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production)
- [Prisma ORM 7 connection pool configuration](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool)
- [Prisma ORM 7 PgBouncer guidance](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/pgbouncer)
- [node-postgres Pool options](https://node-postgres.com/apis/pool) and [TLS options](https://node-postgres.com/features/ssl)
- [Railway PostgreSQL](https://docs.railway.com/databases/postgresql) and [private networking](https://docs.railway.com/networking/private-networking)
