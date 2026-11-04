# User Roles

Roles are workspace-scoped. A person can hold different roles in different workspaces. The
**OWNER / ADMIN / MEMBER** set is implemented and enforced server-side as of Phase 2
(identity & authorization); the permission matrix below records the model.

## Role model (per workspace)

| Role       | Scope                     | Capabilities (Phase 2 where ✔)                                                                                                            |
| ---------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Owner**  | One workspace ✔           | Full control: manage members/roles, rename/edit workspace, invite, transfer ownership, delete workspace. Exactly one owner per workspace. |
| **Admin**  | One workspace ✔           | Manage members with the MEMBER role, invite/revoke invitations, edit workspace settings. Cannot remove/demote the owner or other admins.  |
| **Member** | One workspace ✔           | View the workspace + roster, leave the workspace (self-remove). No member/role management.                                                |
| **Guest**  | Limited channels/projects | _Deferred (later phase)_ — read/participate in specifically shared resources; no workspace settings.                                      |

## Platform-level (non-workspace) identities

- **Anonymous / signed-out** — only auth surfaces (login/register once those phases run). No
  workspace data access.
- **Authenticated user** — has memberships; every request is scoped to workspaces they belong
  to. Being authenticated grants nothing across workspace boundaries.

## Cross-cutting authorization rules (enforced in `apps/api`)

1. Every read/write is constrained to a workspace the caller is a member of — the
   `workspaceScope` middleware derives membership/role from the DB, never from the client (the
   IDOR boundary).
2. Role checks happen at the service layer **and** on the route (`requireWorkspaceRole`) for
   mutations, not only in UI. The renderer's `lib/rbac.ts` only hides actions; it is never the
   security boundary.
3. Invariants enforced server-side: a workspace always has an owner; the owner is removed only
   via ownership **transfer** (never a plain delete of the last owner); an admin cannot
   self-escalate or remove another admin; any member may leave (self-remove).
4. Invitation role/email are bound at creation and checked at accept, so a token cannot grant a
   higher role or admit a different email than invited.

## Notes for later phases

- **Guest** and any further roles are additive; keep the permission model data-driven so new
  roles don't require code changes.
- Billing/plan capabilities and channel/project-scoped permissions arrive with their phases.
- Presence of AI features (summaries/actions) may introduce visibility questions (who can
  request/generate) — decided in the AI phase, respecting the same isolation rules.
