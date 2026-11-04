/**
 * Phase 6 Decision Vault contracts.
 *
 * Single source of truth compiled by BOTH `@buildtogether/api` and the `@buildtogether/desktop`
 * renderer + main IPC surface (mirrors `tasks.ts`). Decisions are FIRST-CLASS records — created
 * deliberately by a human, never auto-derived from messages. Types + const tables only.
 *
 * SECURITY: read/write DTOs only. Authorization is decided server-side on every request (workspace
 * membership + project visibility/ownership). A client sending a `workspaceId`, `projectId`,
 * `conversationId` or `taskId` never gains access — the server re-derives membership and the
 * workspace boundary from the DB, and every link is validated to live inside the SAME workspace.
 */

import type { ApiResponse } from './index';

// ---- Enums (mirror the Prisma enums; string unions for the wire) ----

/**
 * Decision lifecycle. A closed state machine: DRAFT → IN_DISCUSSION → FINALIZED, with SUPERSEDED
 * (replaced by a newer decision — terminal for editing) and ARCHIVED (left the active set; restore
 * returns the pre-archive status). FINALIZED requires a non-empty decision statement (server-enforced).
 */
export type DecisionStatus = 'DRAFT' | 'IN_DISCUSSION' | 'FINALIZED' | 'SUPERSEDED' | 'ARCHIVED';

/** Where a decision came from. Derived server-side from the context link; MEETING/MANUAL are linkless. */
export type DecisionSource = 'PROJECT' | 'CONVERSATION' | 'TASK' | 'MEETING' | 'MANUAL';

/** The kinds of evidence a decision cites. DOCUMENT/LINK/FILE carry `url`; TASK/CONVERSATION carry `entityId`. */
export type DecisionReferenceType = 'DOCUMENT' | 'LINK' | 'TASK' | 'CONVERSATION' | 'FILE';

/** The important events on a decision's history timeline — a small closed vocabulary, not an audit platform. */
export type DecisionHistoryType =
  | 'CREATED'
  | 'UPDATED'
  | 'STATUS_CHANGED'
  | 'FINALIZED'
  | 'SUPERSEDED'
  | 'ALTERNATIVES_CHANGED'
  | 'REFERENCES_CHANGED'
  | 'PARTICIPANT_CHANGED'
  | 'ARCHIVED'
  | 'RESTORED';

export const DECISION_STATUSES: readonly DecisionStatus[] = [
  'DRAFT',
  'IN_DISCUSSION',
  'FINALIZED',
  'SUPERSEDED',
  'ARCHIVED',
] as const;
export const DECISION_SOURCES: readonly DecisionSource[] = [
  'PROJECT',
  'CONVERSATION',
  'TASK',
  'MEETING',
  'MANUAL',
] as const;
export const DECISION_REFERENCE_TYPES: readonly DecisionReferenceType[] = [
  'DOCUMENT',
  'LINK',
  'TASK',
  'CONVERSATION',
  'FILE',
] as const;
export const DECISION_HISTORY_TYPES: readonly DecisionHistoryType[] = [
  'CREATED',
  'UPDATED',
  'STATUS_CHANGED',
  'FINALIZED',
  'SUPERSEDED',
  'ALTERNATIVES_CHANGED',
  'REFERENCES_CHANGED',
  'PARTICIPANT_CHANGED',
  'ARCHIVED',
  'RESTORED',
] as const;

// ---- Read models ----

/** A lightweight actor reference (creator / history actor) — name only, no email. */
export interface DecisionActorView {
  id: string;
  name: string;
}

/** A participant as shown on the roster (avatar-safe subset of a user). */
export interface DecisionParticipantView {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** A considered option. At most one alternative per decision may be `chosen` (server-enforced). */
export interface DecisionAlternativeView {
  id: string;
  label: string;
  description: string | null;
  chosen: boolean;
}

/**
 * Cited evidence. `resolvedLabel` is filled server-side for TASK/CONVERSATION references (the live
 * title of the linked entity, when it still exists in the workspace) so the UI can show + navigate.
 */
export interface DecisionReferenceView {
  id: string;
  type: DecisionReferenceType;
  label: string;
  url: string | null;
  entityId: string | null;
  resolvedLabel: string | null;
}

/** A discussion comment on a decision. Own entity — not mixed with chat messages or task activity. */
export interface DecisionCommentView {
  id: string;
  author: DecisionActorView;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** One history timeline entry. `message` is pre-rendered server-side (closed vocabulary). */
export interface DecisionHistoryView {
  id: string;
  type: DecisionHistoryType;
  actor: DecisionActorView;
  message: string;
  createdAt: string;
}

/**
 * A decision as returned to an authorized caller. Dates are ISO strings (or null). The context links
 * (`projectId` / `conversationId` / `taskId`) are nullable and survive context deletion (SetNull) —
 * the decision remains as a workspace decision. `contextSummary` carries the live label of whichever
 * link is present, for the vault list, or null when the context was removed.
 */
export interface DecisionView {
  id: string;
  workspaceId: string;
  title: string;
  background: string | null;
  decision: string | null;
  rationale: string | null;
  consequences: string | null;
  status: DecisionStatus;
  source: DecisionSource;
  createdBy: DecisionActorView;
  projectId: string | null;
  conversationId: string | null;
  taskId: string | null;
  contextSummary: { id: string; label: string; kind: 'PROJECT' | 'CONVERSATION' | 'TASK' } | null;
  supersededById: string | null;
  supersededByTitle: string | null;
  participantIds: string[];
  participants: DecisionParticipantView[];
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  supersededAt: string | null;
  archivedAt: string | null;
}

/** The full detail record: the view plus the owned sub-entities (alternatives + references). */
export interface DecisionDetailView extends DecisionView {
  alternatives: DecisionAlternativeView[];
  references: DecisionReferenceView[];
}

// ---- List query (search / filter / sort / pagination) ----

export type DecisionSortField = 'createdAt' | 'updatedAt' | 'title' | 'status';

export const DECISION_SORT_FIELDS: readonly DecisionSortField[] = [
  'createdAt',
  'updatedAt',
  'title',
  'status',
] as const;

export interface DecisionListQuery {
  status?: DecisionStatus;
  /** Restrict to one project's decisions (project Decisions section). */
  projectId?: string;
  source?: DecisionSource;
  /** Restrict to decisions a specific user participates in. */
  participantId?: string;
  /** Substring match against title + decision statement (case-insensitive). */
  search?: string;
  sort?: DecisionSortField;
  dir?: 'asc' | 'desc';
  limit?: number;
  /** Opaque forward cursor (base64url of the last seen sort key + id). */
  cursor?: string;
}

// ---- Write inputs (validated server-side; mirrored here for typed clients) ----

/** Create/update payload for the owned alternatives set. */
export interface DecisionAlternativeInput {
  label: string;
  description?: string | null;
  chosen?: boolean;
}

/** Create/update payload for the cited references. Shape rules per type are enforced server-side. */
export interface DecisionReferenceInput {
  type: DecisionReferenceType;
  label: string;
  url?: string | null;
  entityId?: string | null;
}

/**
 * Create a decision. Only `title` is required; status defaults to DRAFT. At most ONE context link may
 * be set; the server DERIVES `source` from it (PROJECT/CONVERSATION/TASK) and falls back to the
 * supplied MANUAL/MEETING value when no link is present. The creator is automatically a participant.
 */
export interface CreateDecisionInput {
  title: string;
  background?: string | null;
  decision?: string | null;
  rationale?: string | null;
  consequences?: string | null;
  status?: 'DRAFT' | 'IN_DISCUSSION';
  source?: 'MANUAL' | 'MEETING';
  projectId?: string | null;
  conversationId?: string | null;
  taskId?: string | null;
  participantUserIds?: string[];
  alternatives?: DecisionAlternativeInput[];
  references?: DecisionReferenceInput[];
}

/** Partial content update. A manager may edit; superseded/archived decisions are locked (409). */
export interface UpdateDecisionInput {
  title?: string;
  background?: string | null;
  decision?: string | null;
  rationale?: string | null;
  consequences?: string | null;
  /** Only DRAFT <-> IN_DISCUSSION via PATCH; finalize/supersede/archive have their own endpoints. */
  status?: 'DRAFT' | 'IN_DISCUSSION';
  /** REPLACE semantics: the supplied set becomes the alternatives list (≤1 chosen, server-checked). */
  alternatives?: DecisionAlternativeInput[];
  /** REPLACE semantics: the supplied set becomes the references list. */
  references?: DecisionReferenceInput[];
}

/** Supersede this decision with a newer one (usually converted from a draft alternative). */
export interface SupersedeDecisionInput {
  byDecisionId: string;
}

/** Add or remove one participant. The target must be a current workspace member. */
export interface DecisionParticipantInput {
  userId: string;
}

/** Add a discussion comment. Body length is capped server-side. */
export interface CreateDecisionCommentInput {
  body: string;
}

// ---- API endpoint aliases (self-documenting response types) ----

export type DecisionListResponse = ApiResponse<DecisionView[]>;
export type DecisionResponse = ApiResponse<DecisionDetailView>;
export type DecisionHistoryListResponse = ApiResponse<DecisionHistoryView[]>;
export type DecisionCommentListResponse = ApiResponse<DecisionCommentView[]>;
