---
name: database-engineering
description: "PostgreSQL schema and data-layer engineering for BuildTogether using Prisma ORM. Use when designing schemas, defining entity relationships and normalization, managing Prisma schema/migrations, indexing, referential integrity, transactions, query optimization, or data consistency. Enforces workspace isolation in every entity and forbids unjustified destructive migrations."
---

# Database Engineering — BuildTogether

Scope: PostgreSQL + Prisma, managed from `apps/api`. Prisma schema lives at
`apps/api/prisma/schema.prisma`; migrations in `apps/api/prisma/migrations`.

## Golden rules

1. **Every product entity is workspace-scoped.** A workspace id is part of the identity
   of rows that belong to a team (projects, tasks, channels-metadata, decisions). No
   query may return cross-workspace data. Enforce with a compound unique/index that
   begins with `workspaceId` wherever a resource is fetched by a natural id.
2. **Never duplicate what Nexconn owns.** Message bodies, delivery state, presence and
   read receipts live in Nexconn. PostgreSQL stores only BuildTogether application
   metadata and references (see `nexconn-integration`). Do not create a `messages` table
   that mirrors the chat provider.
3. **No destructive migration without explicit justification.** Dropping columns/tables,
   narrowing types, or data-losing renames require a written reason and a data
   backfill/rollout plan in the migration's ADR note. Prefer additive, expand–migrate–
   contract changes.

## Schema design

- Model real relationships explicitly (`@relation`) with meaningful `onDelete`
  (`Cascade` only for true ownership like task→labels; `Restrict`/`SetNull` elsewhere).
- Normalize to 3NF by default. Denormalize only with a named read pattern and a
  documented refresh strategy.
- Use `@id @default(cuid())` (or uuid) for primary keys; keep external ids as separate
  indexed columns. Store timestamps `createdAt`/`updatedAt` on every mutable model
  (`@updatedAt`).
- Enums for closed state machines (e.g. `TaskStatus { TODO IN_PROGRESS IN_REVIEW DONE }`)
  — but treat adding/removing enum values as a migration needing care.
- Soft-delete (`deletedAt DateTime?`) only where history/undo matters (e.g. Decision
  Vault); otherwise hard delete with `Restrict` guards.

## Migrations workflow

```
# after editing schema.prisma
pnpm --filter @buildtogether/api prisma:migrate -- --name <snake_case_change>
pnpm --filter @buildtogether/api prisma:generate
```

- Never hand-edit an applied migration; create a new one.
- Never edit `schema.prisma` to match a mistake in SQL — fix the schema, then migrate.
- Each migration name describes intent (`add_task_assignee_index`, not `update1`).
- Migrations are committed and reviewed like code. Run `prisma migrate deploy` in CI,
  never `db push`, against shared databases.

## Indexing & query optimization

- Index every foreign key used in joins and every column in hot `WHERE`/`ORDER BY`.
- Use compound indexes aligned to access patterns, ordered by selectivity
  (`(workspaceId, projectId, status)` for a board query).
- Before adding an index, name the query it serves. Avoid redundant single-column
  indexes already covered by a compound one.
- Paginate list queries with cursor-based pagination (`take`/`skip` only for small,
  bounded sets). Avoid `SELECT *`-style full includes; select needed fields.

## Transactions & consistency

- Wrap multi-step writes (e.g. convert message → task + audit record) in
  `prisma.$transaction`. Keep transactions short; move network/provider calls outside.
- Enforce invariants the database can hold (unique constraints, FKs, non-null) rather
  than relying only on application checks.
- For counters/aggregates, prefer deriving over storing to avoid drift, unless a
  materialized/summary table is explicitly justified.

## Quality checks

1. `prisma validate` and `prisma migrate diff` produce no unintended data loss.
2. Every workspace-owned table has `workspaceId` and an index leading with it.
3. No table duplicates Nexconn-held messaging state.
4. All new FKs have backing indexes; hot queries have a covering index.
5. Destructive changes carry a written justification + rollout note.
6. Schema + migrations committed together; `prisma generate` output not committed.
