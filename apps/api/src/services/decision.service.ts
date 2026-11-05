import type {
  CreateDecisionInput,
  DecisionDetailView,
  DecisionHistoryView,
  DecisionListQuery,
  DecisionCommentView,
  DecisionSortField,
  DecisionSource,
  DecisionStatus,
  DecisionView,
  UpdateDecisionInput,
  WorkspaceRole,
} from '@buildtogether/shared';
import { badRequest, conflict, forbidden, notFound } from '../errors/app-error.js';
import * as decisionRepo from '../repositories/decision.repo.js';
import * as projectService from './project.service.js';
import * as workspaceRepo from '../repositories/workspace.repo.js';
import type { HistoryWrite } from '../repositories/decision.repo.js';
import {
  toDecisionDetailView,
  toDecisionCommentView,
  toDecisionHistoryView,
  toDecisionView,
} from '../lib/view.js';
import type { DecisionDetailRow } from '../lib/view.js';

/**
 * Decision Vault business logic. The route middleware (`authenticate` + `requireWorkspaceRole`) has
 * ALREADY proven (fresh, from the DB) that the caller is a member of the PATH workspace. On top of
 * that this service enforces the DECISION-level rules and never trusts a client-supplied workspace /
 * project / conversation / task / user id — every link is re-validated to live inside this workspace.
 *
 * Permission matrix (server-side; the desktop UI only mirrors this for visibility):
 *   - VIEW (list / get / history / comments): every workspace member, EXCEPT a decision linked to a
 *       PRIVATE project, which is limited to that project's visibility set (owner/creator +
 *       OWNER/ADMIN). Denied reads are a 404 — existence is not leaked across the visibility boundary.
 *   - CREATE: anyone who can VIEW the linked context. The creator is automatically a participant and
 *       the initial owner (unless a different workspace-member `ownerId` is supplied).
 *   - EDIT / PROPOSE / APPROVE / REJECT / SUPERSEDE / ARCHIVE / RESTORE / DELETE / PARTICIPANTS /
 *       OWNER-CHANGE: the decision's manager — its creator, its owner, its project's manager
 *       (workspace OWNER/ADMIN, or the project owner/creator), or a workspace OWNER/ADMIN for
 *       linkless decisions. Mirrors `task.service`'s manager rule exactly.
 *   - COMMENT: anyone who can VIEW the decision. A comment is removed by its author or an editor.
 *
 * Lifecycle (a closed state machine — brief §3/§9): DRAFT → PROPOSED → APPROVED, plus REJECTED (a
 * reviewed proposal that was not accepted; it stays readable for history). APPROVED requires a
 * non-empty decision statement. Only the transitions the matrix below allows are legal; every move
 * writes a typed history row. SUPERSEDED (replaced by a newer decision) and ARCHIVED lock content
 * editing (409); restore returns the pre-archive status. Decisions are explicit — nothing here is
 * ever auto-created from messages.
 *
 *   from        →  allowed targets
 *   DRAFT          PROPOSED (PATCH), APPROVED (approve), ARCHIVED
 *   PROPOSED       DRAFT (PATCH), APPROVED (approve), REJECTED (reject), ARCHIVED
 *   APPROVED       SUPERSEDED (supersede), ARCHIVED
 *   REJECTED       SUPERSEDED (supersede), ARCHIVED
 *   SUPERSEDED     (none — locked)
 *   ARCHIVED       restore → preArchiveStatus
 */

const STATUS_TRANSITIONS: Record<DecisionStatus, readonly DecisionStatus[]> = {
  DRAFT: ['PROPOSED', 'APPROVED', 'ARCHIVED'],
  PROPOSED: ['DRAFT', 'APPROVED', 'REJECTED', 'ARCHIVED'],
  APPROVED: ['SUPERSEDED', 'ARCHIVED'],
  REJECTED: ['SUPERSEDED', 'ARCHIVED'],
  SUPERSEDED: [],
  ARCHIVED: [],
};

export interface Caller {
  userId: string;
  role: WorkspaceRole;
}

const label = (v: string): string =>
  v
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');

// ---- loading + authorization ----

/**
 * Load the full detail row through the READ gate: workspace-scoped (404), then, when the decision
 * lives in a project, `projectService.getProject` enforces visibility (a PRIVATE project the caller
 * cannot see makes the decision a 404 — no leak). Returns the row + whether the caller may MANAGE it.
 */
async function loadDecision(
  decisionId: string,
  workspaceId: string,
  caller: Caller,
): Promise<{ row: DecisionDetailRow; canManage: boolean }> {
  const row = await decisionRepo.findDecision(decisionId, workspaceId);
  if (!row) throw notFound('DECISION_NOT_FOUND', 'Decision not found');
  let projectManage = false;
  if (row.projectId) {
    const project = await projectService.getProject(row.projectId, workspaceId, caller); // 404 if hidden
    projectManage =
      caller.role !== 'MEMBER' ||
      project.owner.id === caller.userId ||
      project.createdById === caller.userId;
  }
  const canManage =
    projectManage ||
    caller.role === 'OWNER' ||
    caller.role === 'ADMIN' ||
    caller.userId === row.createdBy.id ||
    caller.userId === row.owner.id;
  return { row, canManage };
}

function requireManage(canManage: boolean): void {
  if (!canManage) {
    throw forbidden(
      'INSUFFICIENT_ROLE',
      'Only the creator, the owner or a project manager can manage this decision',
    );
  }
}

/** Editing / lifecycle actions are blocked once a decision left the active set. */
function requireEditable(status: DecisionStatus): void {
  if (status === 'SUPERSEDED' || status === 'ARCHIVED') {
    throw conflict('DECISION_LOCKED', 'A superseded or archived decision cannot be modified');
  }
}

/** Assert the requested `next` status is reachable from `current` per the transition matrix. */
function requireTransition(current: DecisionStatus, next: DecisionStatus): void {
  if (current === next) return; // idempotent moves are no-ops at the caller
  if (!STATUS_TRANSITIONS[current].includes(next)) {
    throw conflict(
      'INVALID_TRANSITION',
      `A ${label(current)} decision cannot move to ${label(next)}`,
    );
  }
}

/** Assert `userId` is a current member of `workspaceId` (participants / owners must be real members). */
async function requireMember(workspaceId: string, userId: string, message: string): Promise<void> {
  const role = await workspaceRepo.getRole(workspaceId, userId);
  if (!role) throw badRequest('PARTICIPANT_NOT_MEMBER', message);
}

// ---- shared write validation (links, alternatives, references) ----

/** At most one context link; each link target must live in THIS workspace. Returns the stored fields + derived source. */
async function resolveLink(
  workspaceId: string,
  caller: Caller,
  links: {
    projectId?: string | null | undefined;
    conversationId?: string | null | undefined;
    taskId?: string | null | undefined;
  },
  fallbackSource: 'MANUAL' | 'MEETING' | undefined,
): Promise<{
  projectId: string | null;
  conversationId: string | null;
  taskId: string | null;
  source: DecisionSource;
}> {
  const present = [links.projectId, links.conversationId, links.taskId].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
  if (present.length > 1) {
    throw badRequest(
      'DECISION_MULTI_LINK',
      'A decision links to at most one project, conversation or task',
    );
  }
  const none = { projectId: null, conversationId: null, taskId: null } as const;
  if (links.projectId && present.length === 1) {
    // View gate: you can only attach a decision to a project you can see (404 if hidden).
    await projectService.getProject(links.projectId, workspaceId, caller);
    return { ...none, projectId: links.projectId, source: 'PROJECT' };
  }
  if (links.conversationId && present.length === 1) {
    if (
      !(await decisionRepo.entityInWorkspace('CONVERSATION', links.conversationId, workspaceId))
    ) {
      throw badRequest('DECISION_LINK_INVALID', 'The conversation is not in this workspace');
    }
    return { ...none, conversationId: links.conversationId, source: 'CONVERSATION' };
  }
  if (links.taskId && present.length === 1) {
    if (!(await decisionRepo.entityInWorkspace('TASK', links.taskId, workspaceId))) {
      throw badRequest('DECISION_LINK_INVALID', 'The task is not in this workspace');
    }
    return { ...none, taskId: links.taskId, source: 'TASK' };
  }
  return { ...none, source: (fallbackSource ?? 'MANUAL') as DecisionSource };
}

/** ≤1 chosen alternative; the rest is shape-only (already schema-validated). */
function resolveAlternatives(
  input: CreateDecisionInput['alternatives'],
): decisionRepo.AlternativeWrite[] {
  const list = input ?? [];
  if (list.filter((a) => a.chosen === true).length > 1) {
    throw badRequest('TOO_MANY_CHOSEN', 'At most one alternative can be marked as chosen');
  }
  return list.map((a) => ({
    label: a.label,
    description: a.description ?? null,
    advantages: a.advantages ?? null,
    disadvantages: a.disadvantages ?? null,
    rejectionReason: a.rejectionReason ?? null,
    chosen: a.chosen === true,
  }));
}

/** Shape rules were schema-checked; here the TASK/CONVERSATION/DECISION targets must exist in THIS workspace. */
async function resolveReferences(
  workspaceId: string,
  input: CreateDecisionInput['references'],
): Promise<decisionRepo.ReferenceWrite[]> {
  const list = input ?? [];
  for (const r of list) {
    if (r.type === 'TASK' || r.type === 'CONVERSATION' || r.type === 'DECISION') {
      if (!r.entityId) {
        throw badRequest(
          'REFERENCE_TARGET_REQUIRED',
          'A task/conversation/decision reference needs a target',
        );
      }
      const ok = await decisionRepo.entityInWorkspace(r.type, r.entityId, workspaceId);
      if (!ok) {
        throw badRequest(
          'REFERENCE_TARGET_NOT_FOUND',
          'The referenced entity is not in this workspace',
        );
      }
    }
  }
  return list.map((r) => ({
    type: r.type,
    label: r.label,
    url: r.url ?? null,
    entityId: r.entityId ?? null,
  }));
}

/** Stable signature of the owned sets, used to decide whether a REPLACE actually changed anything. */
function alternativesSignature(
  rows: readonly {
    label: string;
    description: string | null;
    advantages: string | null;
    disadvantages: string | null;
    rejectionReason: string | null;
    chosen: boolean;
  }[],
): string {
  return JSON.stringify(
    rows.map((a) => [
      a.label,
      a.description,
      a.advantages,
      a.disadvantages,
      a.rejectionReason,
      a.chosen,
    ]),
  );
}
function referencesSignature(
  rows: readonly { type: string; label: string; url: string | null; entityId: string | null }[],
): string {
  return JSON.stringify(rows.map((r) => [r.type, r.label, r.url, r.entityId]));
}

// ---- create ----

export async function createDecision(
  workspaceId: string,
  caller: Caller,
  input: CreateDecisionInput,
): Promise<DecisionDetailView> {
  const link = await resolveLink(
    workspaceId,
    caller,
    { projectId: input.projectId, conversationId: input.conversationId, taskId: input.taskId },
    input.source,
  );

  // The creator is always a participant; extra participants must be real workspace members.
  const participantUserIds = Array.from(
    new Set([caller.userId, ...(input.participantUserIds ?? []).filter((id) => id.length > 0)]),
  );
  for (const id of participantUserIds) {
    if (id !== caller.userId) {
      await requireMember(workspaceId, id, 'Participants must be workspace members');
    }
  }

  // The owner is the accountable person: defaults to the creator, may be any current member.
  const ownerId = input.ownerId ?? caller.userId;
  if (ownerId !== caller.userId) {
    await requireMember(workspaceId, ownerId, 'The decision owner must be a workspace member');
  }

  const alternatives = resolveAlternatives(input.alternatives);
  const references = await resolveReferences(workspaceId, input.references);

  const status = input.status ?? 'DRAFT';
  const history: HistoryWrite[] = [{ type: 'CREATED', message: 'Created this decision.' }];
  if (status === 'PROPOSED') {
    history.push({ type: 'STATUS_CHANGED', message: 'Proposed this decision for review.' });
  }

  const row = await decisionRepo.createDecision({
    workspaceId,
    title: input.title,
    summary: input.summary ?? null,
    background: input.background ?? null,
    decision: input.decision ?? null,
    rationale: input.rationale ?? null,
    consequences: input.consequences ?? null,
    status,
    category: input.category ?? 'GENERAL',
    source: link.source,
    projectId: link.projectId,
    conversationId: link.conversationId,
    taskId: link.taskId,
    createdById: caller.userId,
    ownerId,
    participantUserIds,
    alternatives,
    references,
    history,
  });
  return toDecisionDetailView(row);
}

// ---- read ----

export interface DecisionListResult {
  items: DecisionView[];
  nextCursor: string | null;
}

export async function listDecisions(
  workspaceId: string,
  caller: Caller,
  query: DecisionListQuery,
): Promise<DecisionListResult> {
  if (query.projectId) {
    // The project filter also runs the view gate: a PRIVATE project the caller cannot see yields 404.
    await projectService.getProject(query.projectId, workspaceId, caller);
  }
  const { rows, nextCursor } = await decisionRepo.listDecisions({
    workspaceId,
    callerRole: caller.role,
    callerId: caller.userId,
    status: query.status,
    category: query.category,
    projectId: query.projectId,
    source: query.source,
    participantId: query.participantId,
    ownerId: query.ownerId,
    search: query.search && query.search.length > 0 ? query.search : undefined,
    sort: (query.sort ?? 'updatedAt') as DecisionSortField,
    dir: query.dir ?? 'desc',
    limit: query.limit ?? 20,
    cursor: query.cursor,
  });
  return { items: rows.map(toDecisionView), nextCursor };
}

export async function getDecision(
  decisionId: string,
  workspaceId: string,
  caller: Caller,
): Promise<DecisionDetailView> {
  const { row } = await loadDecision(decisionId, workspaceId, caller);
  return toDecisionDetailView(row);
}

// ---- update (content + owned sets) ----

export async function updateDecision(
  decisionId: string,
  workspaceId: string,
  caller: Caller,
  input: UpdateDecisionInput,
): Promise<DecisionDetailView> {
  const { row, canManage } = await loadDecision(decisionId, workspaceId, caller);
  requireManage(canManage);
  requireEditable(row.status);

  const data: decisionRepo.DecisionUpdateFields = {};
  const history: HistoryWrite[] = [];
  let changed = false;

  if (input.title !== undefined && input.title !== row.title) {
    data.title = input.title;
    history.push({ type: 'UPDATED', message: 'Renamed this decision.' });
    changed = true;
  }
  for (const field of ['summary', 'background', 'decision', 'rationale', 'consequences'] as const) {
    const next = input[field];
    if (next !== undefined && next !== row[field]) {
      data[field] = next ?? null;
      history.push({ type: 'UPDATED', message: `Updated the ${field}.` });
      changed = true;
    }
  }
  if (input.category !== undefined && input.category !== row.category) {
    data.category = input.category;
    history.push({ type: 'UPDATED', message: `Re-categorised as ${label(input.category)}.` });
    changed = true;
  }
  if (input.ownerId !== undefined && input.ownerId !== row.owner.id) {
    await requireMember(
      workspaceId,
      input.ownerId,
      'The decision owner must be a workspace member',
    );
    data.ownerId = input.ownerId;
    const who = await decisionRepo.getUserBrief(input.ownerId);
    history.push({
      type: 'OWNER_CHANGED',
      message: who ? `Transferred ownership to ${who.name}.` : 'Transferred ownership.',
    });
    changed = true;
  }
  if (input.status !== undefined && input.status !== row.status) {
    requireTransition(row.status, input.status);
    data.status = input.status;
    history.push({
      type: 'STATUS_CHANGED',
      message: `Moved from ${label(row.status)} to ${label(input.status)}.`,
    });
    changed = true;
  }

  let alternatives: decisionRepo.AlternativeWrite[] | undefined;
  if (input.alternatives !== undefined) {
    const next = resolveAlternatives(input.alternatives);
    if (alternativesSignature(next) !== alternativesSignature(row.alternatives)) {
      alternatives = next;
      history.push({ type: 'ALTERNATIVES_CHANGED', message: 'Updated the alternatives.' });
      changed = true;
    }
  }
  let references: decisionRepo.ReferenceWrite[] | undefined;
  if (input.references !== undefined) {
    const next = await resolveReferences(workspaceId, input.references);
    if (referencesSignature(next) !== referencesSignature(row.references)) {
      references = next;
      history.push({ type: 'REFERENCES_CHANGED', message: 'Updated the references.' });
      changed = true;
    }
  }

  if (!changed) return toDecisionDetailView(row); // echo, no write, no history

  const updated = await decisionRepo.updateDecision(decisionId, workspaceId, caller.userId, {
    data,
    history,
    ...(alternatives !== undefined ? { alternatives } : {}),
    ...(references !== undefined ? { references } : {}),
  });
  return toDecisionDetailView(updated);
}

// ---- lifecycle ----

/** DRAFT / PROPOSED → APPROVED. Requires a non-empty decision statement (brief §3). */
export async function approveDecision(
  decisionId: string,
  workspaceId: string,
  caller: Caller,
): Promise<DecisionDetailView> {
  const { row, canManage } = await loadDecision(decisionId, workspaceId, caller);
  requireManage(canManage);
  if (row.status === 'APPROVED') return toDecisionDetailView(row); // idempotent
  requireEditable(row.status);
  requireTransition(row.status, 'APPROVED');
  if (!row.decision || row.decision.trim().length === 0) {
    throw badRequest(
      'DECISION_STATEMENT_REQUIRED',
      'Write the decision statement before approving',
    );
  }
  const history: HistoryWrite[] = [
    { type: 'STATUS_CHANGED', message: `Moved from ${label(row.status)} to Approved.` },
    { type: 'APPROVED', message: 'Approved this decision.' },
  ];
  const updated = await decisionRepo.updateDecision(decisionId, workspaceId, caller.userId, {
    data: { status: 'APPROVED', approvedAt: new Date() },
    history,
  });
  return toDecisionDetailView(updated);
}

/** PROPOSED → REJECTED. A rejected decision stays readable for historical reference. */
export async function rejectDecision(
  decisionId: string,
  workspaceId: string,
  caller: Caller,
): Promise<DecisionDetailView> {
  const { row, canManage } = await loadDecision(decisionId, workspaceId, caller);
  requireManage(canManage);
  if (row.status === 'REJECTED') return toDecisionDetailView(row); // idempotent
  requireEditable(row.status);
  requireTransition(row.status, 'REJECTED');
  const history: HistoryWrite[] = [
    { type: 'STATUS_CHANGED', message: `Moved from ${label(row.status)} to Rejected.` },
    { type: 'REJECTED', message: 'Rejected this decision.' },
  ];
  const updated = await decisionRepo.updateDecision(decisionId, workspaceId, caller.userId, {
    data: { status: 'REJECTED', rejectedAt: new Date() },
    history,
  });
  return toDecisionDetailView(updated);
}

export async function supersedeDecision(
  decisionId: string,
  workspaceId: string,
  caller: Caller,
  byDecisionId: string,
): Promise<DecisionDetailView> {
  const { row, canManage } = await loadDecision(decisionId, workspaceId, caller);
  requireManage(canManage);
  requireEditable(row.status);
  requireTransition(row.status, 'SUPERSEDED');
  if (byDecisionId === decisionId) {
    throw badRequest('SELF_SUPERSEDE', 'A decision cannot supersede itself');
  }
  const by = await decisionRepo.findDecisionAuthFields(byDecisionId, workspaceId);
  if (!by) throw notFound('DECISION_NOT_FOUND', 'The replacement decision was not found');
  if (by.status === 'SUPERSEDED' || by.status === 'ARCHIVED') {
    throw badRequest('SUPERSEDE_TARGET_LOCKED', 'The replacement decision must be active');
  }
  const history: HistoryWrite[] = [
    { type: 'STATUS_CHANGED', message: `Moved from ${label(row.status)} to Superseded.` },
    { type: 'SUPERSEDED', message: `Superseded by “${by.title}”.` },
  ];
  const updated = await decisionRepo.updateDecision(decisionId, workspaceId, caller.userId, {
    data: { status: 'SUPERSEDED', supersededAt: new Date(), supersededById: byDecisionId },
    history,
  });
  return toDecisionDetailView(updated);
}

export async function archiveDecision(
  decisionId: string,
  workspaceId: string,
  caller: Caller,
): Promise<DecisionDetailView> {
  const { row, canManage } = await loadDecision(decisionId, workspaceId, caller);
  requireManage(canManage);
  if (row.status === 'ARCHIVED') return toDecisionDetailView(row); // idempotent
  if (row.status === 'SUPERSEDED') {
    throw conflict('DECISION_LOCKED', 'A superseded decision cannot be archived');
  }
  requireTransition(row.status, 'ARCHIVED');
  const history: HistoryWrite[] = [
    { type: 'STATUS_CHANGED', message: `Moved from ${label(row.status)} to Archived.` },
    { type: 'ARCHIVED', message: 'Archived this decision.' },
  ];
  const updated = await decisionRepo.updateDecision(decisionId, workspaceId, caller.userId, {
    data: { status: 'ARCHIVED', archivedAt: new Date(), preArchiveStatus: row.status },
    history,
  });
  return toDecisionDetailView(updated);
}

export async function restoreDecision(
  decisionId: string,
  workspaceId: string,
  caller: Caller,
): Promise<DecisionDetailView> {
  const { row, canManage } = await loadDecision(decisionId, workspaceId, caller);
  requireManage(canManage);
  if (row.status !== 'ARCHIVED') return toDecisionDetailView(row); // nothing to do
  // RESTORE returns the decision where it left off; DRAFT is the safe default if nothing was remembered.
  const backTo = row.preArchiveStatus ?? 'DRAFT';
  const history: HistoryWrite[] = [
    { type: 'STATUS_CHANGED', message: `Restored from Archived to ${label(backTo)}.` },
    { type: 'RESTORED', message: 'Restored this decision.' },
  ];
  const updated = await decisionRepo.updateDecision(decisionId, workspaceId, caller.userId, {
    data: { status: backTo, archivedAt: null, preArchiveStatus: null },
    history,
  });
  return toDecisionDetailView(updated);
}

// ---- delete ----

export async function deleteDecision(
  decisionId: string,
  workspaceId: string,
  caller: Caller,
): Promise<null> {
  const { canManage } = await loadDecision(decisionId, workspaceId, caller);
  requireManage(canManage);
  await decisionRepo.deleteDecision(decisionId);
  return null;
}

// ---- participants ----

export async function addParticipant(
  decisionId: string,
  workspaceId: string,
  caller: Caller,
  userId: string,
): Promise<DecisionDetailView> {
  const { row, canManage } = await loadDecision(decisionId, workspaceId, caller);
  requireManage(canManage);
  requireEditable(row.status);
  if (userId !== caller.userId) {
    await requireMember(workspaceId, userId, 'Participants must be workspace members');
  }
  const who = await decisionRepo.getUserBrief(userId);
  await decisionRepo.addParticipant(decisionId, workspaceId, caller.userId, userId, {
    type: 'PARTICIPANT_CHANGED',
    message: who ? `Added ${who.name} as a participant.` : 'Added a participant.',
  });
  return getDecision(decisionId, workspaceId, caller);
}

export async function removeParticipant(
  decisionId: string,
  workspaceId: string,
  caller: Caller,
  userId: string,
): Promise<DecisionDetailView> {
  const { row, canManage } = await loadDecision(decisionId, workspaceId, caller);
  requireManage(canManage);
  requireEditable(row.status);
  // The creator always stays on the roster — a decision never loses its authorship record.
  if (userId === row.createdBy.id) {
    throw badRequest('CREATOR_REQUIRED', 'The creator cannot be removed as a participant');
  }
  await decisionRepo.removeParticipant(decisionId, workspaceId, caller.userId, userId, {
    type: 'PARTICIPANT_CHANGED',
    message: 'Removed a participant.',
  });
  return getDecision(decisionId, workspaceId, caller);
}

// ---- history + comments ----

export interface DecisionFeedResult<T> {
  items: T[];
  nextCursor: string | null;
}

export async function listHistory(
  decisionId: string,
  workspaceId: string,
  caller: Caller,
  query: { limit?: number; cursor?: string },
): Promise<DecisionFeedResult<DecisionHistoryView>> {
  await loadDecision(decisionId, workspaceId, caller); // read gate
  const { rows, nextCursor } = await decisionRepo.listHistory(
    decisionId,
    query.limit ?? 30,
    query.cursor,
  );
  return { items: rows.map(toDecisionHistoryView), nextCursor };
}

export async function listComments(
  decisionId: string,
  workspaceId: string,
  caller: Caller,
  query: { limit?: number; cursor?: string },
): Promise<DecisionFeedResult<DecisionCommentView>> {
  await loadDecision(decisionId, workspaceId, caller); // read gate
  const { rows, nextCursor } = await decisionRepo.listComments(
    decisionId,
    query.limit ?? 30,
    query.cursor,
  );
  return { items: rows.map(toDecisionCommentView), nextCursor };
}

/** Anyone who can VIEW the decision can join its discussion. */
export async function addComment(
  decisionId: string,
  workspaceId: string,
  caller: Caller,
  body: string,
): Promise<DecisionCommentView> {
  await loadDecision(decisionId, workspaceId, caller); // read gate (throws 404 if hidden)
  const row = await decisionRepo.createComment(decisionId, workspaceId, caller.userId, body);
  return toDecisionCommentView(row);
}

/** A comment is removed by its author, or by anyone who can edit the decision. */
export async function deleteComment(
  decisionId: string,
  commentId: string,
  workspaceId: string,
  caller: Caller,
): Promise<null> {
  const { canManage } = await loadDecision(decisionId, workspaceId, caller);
  const comment = await decisionRepo.findComment(commentId, decisionId, workspaceId);
  if (!comment) throw notFound('COMMENT_NOT_FOUND', 'Comment not found');
  if (comment.authorId !== caller.userId && !canManage) {
    throw forbidden(
      'INSUFFICIENT_ROLE',
      'Only the author or a decision editor can remove a comment',
    );
  }
  const deleted = await decisionRepo.deleteComment(commentId, decisionId);
  if (!deleted) throw notFound('COMMENT_NOT_FOUND', 'Comment not found');
  return null;
}
