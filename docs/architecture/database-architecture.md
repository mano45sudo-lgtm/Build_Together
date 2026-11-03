# Database Architecture

PostgreSQL + Prisma ORM, managed from `apps/api`. Governed by the `database-engineering`
skill. Migrations are version-controlled and committed.

## Scope of the store

BuildTogether's PostgreSQL holds **application state and relationships only**. It must
**not** duplicate what Nexconn owns: message bodies, delivery state, presence and read
receipts live in Nexconn. We store references (opaque Nexconn ids) and BuildTogether
entities.

## Planned entity domains (designed ahead, built phase by phase)

| Domain    | Models (indicative)                                                    | Notes                                                               |
| --------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Identity  | `User`, `Session`                                                      | Auth; hashed credentials only.                                      |
| Workspace | `Workspace`, `Membership(userId, workspaceId, role)`                   | Root of isolation; every scoped row carries `workspaceId`.          |
| Projects  | `Project`, `ChannelLink(projectId, nexconnChannelId)`                  | Project channels reference Nexconn, don't mirror them.              |
| Work      | `Task(workspaceId, projectId, status, assigneeId, sourceRef)`          | `sourceRef` stores the originating Nexconn message id → provenance. |
| Decisions | `Decision(workspaceId, title, body, sourceRef, createdAt, deletedAt?)` | Decision Vault; soft-delete where history matters.                  |
| Pulse/AI  | later (summary/action artifacts, pointers)                             | Introduced with the AI phase.                                       |

Exact fields are defined when each phase is authorized — **not** created in Phase 0.

## Design rules

- **Workspace isolation:** `workspaceId` is part of the identity of scoped rows; leading
  compound indexes on `(workspaceId, …)` for hot queries.
- **Keys:** `@default(cuid())` ids; external/Nexconn ids stored as separate indexed columns.
- **Timestamps:** `createdAt` + `@updatedAt` on mutable models.
- **Relations:** explicit `@relation` with meaningful `onDelete` (Cascade only for true
  ownership; else Restrict/SetNull). 3NF by default; denormalize only with a named reason.
- **Integrity in the DB:** unique constraints, FKs and non-nulls enforce invariants;
  multi-step writes use `prisma.$transaction`.

## Migration workflow

```
edit prisma/schema.prisma
pnpm --filter @buildtogether/api prisma:migrate -- --name <snake_case_intent>
pnpm --filter @buildtogether/api prisma:generate
```

- Never hand-edit applied migrations; add new ones; `migrate deploy` in CI (no `db push`).
- **No destructive migration without written justification** + backfill/rollout note;
  prefer additive expand→migrate→contract.

## Prisma 7 configuration note (verified in Phase 0)

Prisma 7 **no longer allows the datasource `url` in `schema.prisma`** (error P1012). The
schema declares only `provider = "postgresql"`; the connection URL is provided by
`prisma.config.ts` (for the Migrate CLI) and to `PrismaClient` at runtime (direct adapter or
Accelerate URL). Phase 0 validated `prisma validate` and `prisma generate` against the
pinned stable `7.10.1` with an intentionally model-free schema; `prisma.config.ts` is added
when migrations begin in the database phase.

## Phase 0 state

No schema or migrations are created in Phase 0 (no features). This document establishes the
design constraints so the first data phase starts from an agreed model. Prisma is kept on
the **stable `7.x`** line, not the `8.x` RC.
