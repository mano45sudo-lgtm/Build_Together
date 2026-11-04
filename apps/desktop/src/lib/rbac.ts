import type { WorkspaceRole } from '@buildtogether/shared';

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
