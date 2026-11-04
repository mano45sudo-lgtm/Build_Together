# Database Architecture

PostgreSQL + Prisma ORM, managed from `apps/api`. Governed by the `database-engineering`
skill. Migrations are version-controlled and committed.

## Scope of the store

BuildTogether's PostgreSQL holds **application state and relationships only**. It must
**not** duplicate what Nexconn owns: message bodies, delivery state, presence and read
receipts live in Nexconn. We store references (opaque Nexconn ids) and BuildTogether
entities.

## Entity domains (built phase by phase)

| Domain    | Models (indicative)                                                                   | Notes                                                                         |
| --------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Identity  | `User`, `Session` **_(built, Phase 2)_**                                              | Auth; hashed credentials + hashed opaque sessions only.                       |
| Workspace | `Workspace`, `WorkspaceMembership`, `WorkspaceInvitation` **_(built, Phase 2)_**      | Root of isolation; every scoped row carries `workspaceId`.                    |
| Projects  | `Project` **_(built, Phase 4)_**; `ChannelLink(projectId, nexconnChannelId)` (future) | Project channels would reference Nexconn, not mirror it — **not yet built**.  |
| Work      | `Task(workspaceId, projectId, status, assigneeId, sourceRef)`                         | `sourceRef` stores the originating Nexconn message id → provenance. (Phase 5) |
| Decisions | `Decision(workspaceId, title, body, sourceRef, createdAt, deletedAt?)`                | Decision Vault; soft-delete where history matters. (Phase 5)                  |
| Pulse/AI  | later (summary/action artifacts, pointers)                                            | Introduced with the AI phase.                                                 |

Fields for a domain are defined only when its phase is authorized — never created ahead.

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

## Prisma 7 configuration note (verified)

Prisma 7 **no longer allows the datasource `url` in `schema.prisma`** (error P1012). The
schema declares only `provider = "postgresql"`; the connection URL is provided by
`prisma.config.ts` (for the Migrate CLI) and to `PrismaClient` at runtime through the
`@prisma/adapter-pg` driver adapter (Query Compiler enabled, no bundled engine). Validated
against the pinned stable `7.10.1`.

## Phase 2 state (identity, workspaces & team management — built)

The first real schema is committed as migration `20261103175232_init_identity_workspaces`
(applied against Docker PG `bt-postgres`; **non-destructive** — `CREATE` only, no `DROP`).
Models and invariants:

- **`User`** — `email @unique`, `passwordHash` (Argon2id; plaintext never stored), `status`
  (`ACTIVE`/`DISABLED`), optional `avatarUrl`.
- **`Session`** — server-managed opaque session. Only `accessTokenHash`/`refreshTokenHash`
  (`@unique`, SHA-256) are stored; `familyId` groups a rotation lineage for reuse detection;
  `revokedAt` + dual expiry (`accessExpiresAt`/`refreshExpiresAt`) enable immediate
  server-side revocation. `onDelete: Cascade` from `User` clears a departing user's sessions.
- **`Workspace`** — `createdBy` FK (`onDelete: Restrict`: never orphan audit of who created a
  workspace); `name`/`description`/`iconUrl`.
- **`WorkspaceMembership`** — `@@unique([workspaceId, userId])` (no double-add); role
  `OWNER`/`ADMIN`/`MEMBER`; indexes on `(workspaceId, role)` and `(userId)` for the isolation
  middleware and "my workspaces" query.
- **`WorkspaceInvitation`** — `tokenHash @unique` (raw token returned once, never persisted);
  `email`+`role` bound into the invite (prevents role/email escalation); `status`
  (`PENDING`/`ACCEPTED`/`EXPIRED`/`REVOKED`) with `expiresAt`/`acceptedAt`/`revokedAt` giving
  single-use, expiring tokens.

Referential integrity, `cuid()` ids, `@updatedAt`, and leading `(workspaceId, …)` compound
indexes follow the design rules above. Work/Decisions remain unbuilt (Phase 5+).

## Phase 4 state (projects — built)

Committed as migration `20261104055810_add_projects` (**additive, non-destructive** — `CREATE` only,
no `DROP`; Phase 2/3 data preserved; applied against Docker PG `bt-postgres`).

- **`Project`** — `workspaceId` FK (isolation root; `onDelete: Cascade`), `name`, `description?`,
  `projectKey`, `slug`, `status` enum (`PLANNING`/`ACTIVE`/`ON_HOLD`/`COMPLETED`), `visibility` enum
  (`WORKSPACE`/`PRIVATE`), `ownerId` + `createdById` FKs (`onDelete: Restrict` — a project always
  points at a real member; ownership is reassigned, never left dangling), optional `startDate`/
  `targetDate`/`icon`/`color`, plus `createdAt`/`@updatedAt` and `archivedAt?`.
- **Uniqueness is scoped to the workspace, not global:** `@@unique([workspaceId, projectKey])` and
  `@@unique([workspaceId, slug])` — two workspaces may reuse a key; within one it is unique. Compound
  `(workspaceId, …)` indexes back the hot list queries; `@@index([workspaceId, archivedAt])` serves the
  All/Active/Archived scopes.
- **Archive is a marker, not a status** — `archivedAt` (a timestamp) is the **sole** archive signal,
  deliberately kept **out** of the `status` enum so archiving never overwrites a real workflow status
  and restore returns the prior status untouched.
- **No project-membership table** — this phase derives project access from `WorkspaceMembership` +
  `ownerId`/`createdById` + `visibility` (enforced server-side). Per-project membership, and any
  `ChannelLink`/`Task`, are introduced only when their phase is authorized (never created ahead).
