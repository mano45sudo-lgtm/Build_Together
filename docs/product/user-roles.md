# User Roles

Roles are workspace-scoped. A person can hold different roles in different workspaces. The
exact permission matrix is finalized in the workspace/authorization phase; this records the
intended model so schema and security design stay consistent.

## Role model (per workspace)

| Role       | Scope                     | Intended capabilities                                                                                         |
| ---------- | ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Owner**  | One workspace             | Full control incl. billing/dangerous ops, delete workspace, transfer ownership, manage admins.                |
| **Admin**  | One workspace             | Manage members/roles, projects/channels settings, all member capabilities.                                    |
| **Member** | One workspace             | Participate in chat, create/assign/manipulate tasks, save decisions, view project progress.                   |
| **Guest**  | Limited channels/projects | Read + participate in specifically shared channels; restricted task/decision creation; no workspace settings. |

## Platform-level (non-workspace) identities

- **Anonymous / signed-out** — only auth surfaces (login/register once those phases run). No
  workspace data access.
- **Authenticated user** — has memberships; every request is scoped to workspaces they belong
  to. Being authenticated grants nothing across workspace boundaries.

## Cross-cutting authorization rules (enforced in `apps/api`)

1. Every read/write is constrained to a workspace the caller is a member of (server-derived,
   never client-supplied) — the IDOR boundary.
2. Role checks happen at the service layer for mutations, not only UI hiding.
3. Guests see only explicitly shared channels/resources; default-deny otherwise.
4. Destructive/workspace-admin actions are Owner/Admin only.

## Notes for later phases

- Role set and names are a product decision to confirm with the user; keep the permission
  model data-driven so new roles don't require code changes.
- Presence of AI features (summaries/actions) may introduce visibility questions (who can
  request/generate) — decided in the AI phase, respecting the same isolation rules.

No roles are implemented in Phase 0; this document anchors future schema and security design.
