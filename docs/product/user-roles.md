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

## Project-level authorization (Phase 4 — built)

Projects add no new role and no separate membership table — project rights are **derived** from the
workspace role plus ownership/creatorship and the project's `visibility`. The matrix (enforced in
`apps/api`, mirrored for visibility only in the renderer):

| Actor                              | View                                     | Create | Update / archive / restore / change-owner |
| ---------------------------------- | ---------------------------------------- | ------ | ----------------------------------------- |
| Workspace **OWNER / ADMIN**        | All projects in workspace                | ✔      | ✔ (any project)                           |
| **MEMBER** (project owner/creator) | Workspace-visible + own PRIVATE          | ✔      | ✔ (only projects they own/created)        |
| **MEMBER** (other)                 | Workspace-visible (`WORKSPACE`) projects | ✔      | ✘                                         |

Rules: assigning/reassigning a project owner to another user is an **OWNER/ADMIN** action and the
target must be a current workspace member (`OWNER_NOT_MEMBER` otherwise); a project always keeps
exactly one owner; a **PRIVATE** project is visible only to its owner/creator and workspace
OWNER/ADMIN — a non-entitled read returns **404** (existence not leaked); cross-workspace access is
always **404**. This respects the same IDOR boundary as the cross-cutting rules above.

## Notes for later phases

- **Guest** and any further roles are additive; keep the permission model data-driven so new
  roles don't require code changes.
- Billing/plan capabilities and channel-scoped (project↔Nexconn) permissions arrive with their phases;
  project-scoped permissions landed in Phase 4 (see the project-level matrix above).
- Presence of AI features (summaries/actions) may introduce visibility questions (who can
  request/generate) — decided in the AI phase, respecting the same isolation rules.
