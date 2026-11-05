import type {
  DecisionCategory,
  DecisionHistoryType,
  DecisionReferenceType,
  DecisionSource,
  DecisionStatus,
} from '@buildtogether/shared';
import type { BadgeTone } from '../../components/ui/Badge';

/**
 * Presentation helpers for the Decision Vault. Pure, dependency-free and locale-stable so a vault row,
 * a grouped section header and the detail panel always render the same status/category/source label.
 * These are VISUAL only — they carry NO authorization meaning (the server decides who may act).
 *
 * Monochrome discipline (DESIGN.md): the vault reads calm. Status is the only place hue appears, and it
 * is restrained — Approved (accepted) is success, Rejected (declined) is danger, Proposed (awaiting
 * review) is the neutral info grey, and Draft / Superseded / Archived stay neutral. A label always
 * accompanies the tint, so meaning never rides on colour alone. Category and source are topic labels,
 * never coloured.
 */

const STATUS_TONES: Record<DecisionStatus, BadgeTone> = {
  DRAFT: 'neutral',
  PROPOSED: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  SUPERSEDED: 'neutral',
  ARCHIVED: 'neutral',
};

const STATUS_LABELS: Record<DecisionStatus, string> = {
  DRAFT: 'Draft',
  PROPOSED: 'Proposed',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUPERSEDED: 'Superseded',
  ARCHIVED: 'Archived',
};

export function decisionStatusTone(status: DecisionStatus): BadgeTone {
  return STATUS_TONES[status];
}

export function decisionStatusLabel(status: DecisionStatus): string {
  return STATUS_LABELS[status];
}

/**
 * The vault's reading order — most decision-worthy first. Exported so the grouped view and any count
 * summary iterate the same sequence; a status with no decisions renders no section.
 */
export const DECISION_STATUS_ORDER: readonly DecisionStatus[] = [
  'APPROVED',
  'PROPOSED',
  'DRAFT',
  'REJECTED',
  'SUPERSEDED',
  'ARCHIVED',
];

/** The live, working set — everything that has not left it (superseded / archived). */
export const ACTIVE_DECISION_STATUSES: readonly DecisionStatus[] = [
  'DRAFT',
  'PROPOSED',
  'APPROVED',
  'REJECTED',
];

const CATEGORY_LABELS: Record<DecisionCategory, string> = {
  PRODUCT: 'Product',
  DESIGN: 'Design',
  ENGINEERING: 'Engineering',
  BUSINESS: 'Business',
  OPERATIONS: 'Operations',
  GENERAL: 'General',
};

export function decisionCategoryLabel(category: DecisionCategory): string {
  return CATEGORY_LABELS[category];
}

const SOURCE_LABELS: Record<DecisionSource, string> = {
  PROJECT: 'Project',
  CONVERSATION: 'Conversation',
  TASK: 'Task',
  MEETING: 'Meeting',
  MANUAL: 'Manual',
};

export function decisionSourceLabel(source: DecisionSource): string {
  return SOURCE_LABELS[source];
}

const HISTORY_LABELS: Record<DecisionHistoryType, string> = {
  CREATED: 'Created',
  UPDATED: 'Updated',
  STATUS_CHANGED: 'Status',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUPERSEDED: 'Superseded',
  ALTERNATIVES_CHANGED: 'Alternatives',
  REFERENCES_CHANGED: 'References',
  PARTICIPANT_CHANGED: 'Participants',
  OWNER_CHANGED: 'Owner',
  ARCHIVED: 'Archived',
  RESTORED: 'Restored',
};

/** A short tag for a timeline entry type (the server-rendered message carries the full sentence). */
export function decisionHistoryLabel(type: DecisionHistoryType): string {
  return HISTORY_LABELS[type];
}

const REFERENCE_LABELS: Record<DecisionReferenceType, string> = {
  DOCUMENT: 'Document',
  LINK: 'Link',
  TASK: 'Task',
  CONVERSATION: 'Conversation',
  DECISION: 'Decision',
  FILE: 'File',
};

export function decisionReferenceLabel(type: DecisionReferenceType): string {
  return REFERENCE_LABELS[type];
}

/** `YYYY-MM-DDTHH:mm:ss.sssZ` → a stable, readable absolute date (`Mar 4, 2026`). Null / invalid → an em dash. */
export function formatDecisionDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ---- Lifecycle affordances (a UI MIRROR of the server's closed state machine) ----
//
// These only decide which action controls to SHOW. Every action is re-authorized and re-validated by
// the server (`decision.service`), so hiding a control here never grants or withholds real access —
// it just keeps the panel honest about what the current status can move to.

/** Content (title, statements, alternatives, references, participants) is locked once closed. */
export function decisionIsEditable(status: DecisionStatus): boolean {
  return status !== 'SUPERSEDED' && status !== 'ARCHIVED';
}

/** DRAFT → PROPOSED (a PATCH move; PROPOSED can move back to DRAFT). */
export function canPropose(status: DecisionStatus): boolean {
  return status === 'DRAFT';
}

export function canWithdrawToDraft(status: DecisionStatus): boolean {
  return status === 'PROPOSED';
}

/**
 * DRAFT / PROPOSED → APPROVED. The server additionally refuses an approve when the decision statement
 * is empty, so the caller gates on `canApprove(status) && statementPresent`.
 */
export function canApprove(status: DecisionStatus): boolean {
  return status === 'DRAFT' || status === 'PROPOSED';
}

/** Only a reviewed proposal can be rejected (PROPOSED → REJECTED). */
export function canReject(status: DecisionStatus): boolean {
  return status === 'PROPOSED';
}

/** An accepted or declined decision can be replaced by a newer one (→ SUPERSEDED). */
export function canSupersede(status: DecisionStatus): boolean {
  return status === 'APPROVED' || status === 'REJECTED';
}

/** Any live status can leave the active set (→ ARCHIVED); superseded/archived are already closed. */
export function canArchive(status: DecisionStatus): boolean {
  return status !== 'SUPERSEDED' && status !== 'ARCHIVED';
}

export function canRestore(status: DecisionStatus): boolean {
  return status === 'ARCHIVED';
}
