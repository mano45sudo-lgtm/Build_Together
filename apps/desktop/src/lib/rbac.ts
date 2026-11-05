import type { DecisionView, ProjectView, WorkspaceRole } from '@buildtogether/shared';

/**
 * Client-side visibility helpers ONLY. They hide actions the current role cannot perform so the UI
 * is honest; they are NEVER the security boundary — the server re-derives roles from the database and
 * authorizes every mutation (see members.service / workspace-scope middleware, ADR-0003 §7).
 */

/** OWNER and ADMIN can invite people and change workspace settings. */
export function canManageTeam(role: WorkspaceRole): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

/**
 * Can `actor` change `target`'s ADMIN/MEMBER role?
 *  - OWNER: any non-OWNER target (ownership moves only via transfer).
 *  - ADMIN: a plain MEMBER, and never themselves (no self-escalation).
 */
export function canChangeRole(
  actor: WorkspaceRole,
  target: WorkspaceRole,
  isSelf: boolean,
): boolean {
  if (target === 'OWNER') return false;
  if (actor === 'OWNER') return true;
  if (actor === 'ADMIN') return target === 'MEMBER' && !isSelf;
  return false;
}

/**
 * Can `actor` remove `target`? Owners are never removed here (transfer first). A member may always
 * remove THEMSELVES (leave). ADMIN removes plain MEMBERs only.
 */
export function canRemove(actor: WorkspaceRole, target: WorkspaceRole, isSelf: boolean): boolean {
  if (target === 'OWNER') return false;
  if (isSelf) return true;
  if (actor === 'OWNER') return true;
  if (actor === 'ADMIN') return target === 'MEMBER';
  return false;
}

/** Only the owner can transfer, and only to an existing non-owner member. */
export function canTransferTo(actor: WorkspaceRole, target: WorkspaceRole): boolean {
  return actor === 'OWNER' && target !== 'OWNER';
}

/**
 * Project management mirror (client-side visibility ONLY — the server is authoritative). A workspace
 * OWNER/ADMIN manages every project; a plain MEMBER manages only projects they own or created. This is
 * exactly `project.service.canManage`; it exists so the UI can hide controls, never to grant access.
 */
export function canManageProject(
  project: ProjectView,
  caller: { role: WorkspaceRole; userId: string },
): boolean {
  if (caller.role === 'OWNER' || caller.role === 'ADMIN') return true;
  return caller.userId === project.owner.id || caller.userId === project.createdById;
}

/**
 * Decision management mirror (client-side visibility ONLY — the server is authoritative). Exactly
 * `decision.service.loadDecision`'s `canManage`: a workspace OWNER/ADMIN, the decision's creator, its
 * owner, or — when the decision is linked to a project — that project's manager. The optional
 * `project` is supplied by the caller only when it already holds the linked project (the vault
 * fetches the project list to resolve it); without it a plain MEMBER just sees the role/creator/owner
 * subset, which is a smaller affordance, never a grant. The server re-checks on every write.
 */
export function canManageDecision(
  decision: DecisionView,
  caller: { role: WorkspaceRole; userId: string },
  project?: ProjectView,
): boolean {
  if (caller.role === 'OWNER' || caller.role === 'ADMIN') return true;
  if (caller.userId === decision.createdBy.id || caller.userId === decision.owner.id) return true;
  if (project) return canManageProject(project, caller);
  return false;
}

/**
 * Can a caller assign the project owner to `memberId`? Only OWNER/ADMIN may set a DIFFERENT owner up
 * front (mirrors `project.service.createProject`); a MEMBER always owns what they create.
 */
export function canAssignProjectOwner(role: WorkspaceRole): boolean {
  return role === 'OWNER' || role === 'ADMIN';
}

/**
 * Extract the invitation token from either a raw token or a pasted accept link
 * (`.../invite/accept?token=...`). Returns `null` when nothing usable is present.
 */
export function parseInviteToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = /[?&]token=([^&\s]+)/i.exec(trimmed);
  if (match?.[1]) return decodeURIComponent(match[1]);
  // A bare token: long, high-entropy, no whitespace or URL punctuation.
  if (/^[A-Za-z0-9_-]{16,}$/.test(trimmed)) return trimmed;
  return null;
}
