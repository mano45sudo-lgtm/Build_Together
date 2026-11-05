import type {
  DecisionCategory,
  DecisionHistoryType,
  DecisionReferenceType,
  DecisionSource,
  DecisionSortField,
  DecisionStatus,
  WorkspaceRole,
} from '@buildtogether/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import type {
  DecisionAlternativeRow,
  DecisionCommentRow,
  DecisionDetailRow,
  DecisionHistoryRow,
  DecisionReferenceRow,
  DecisionRow,
} from '../lib/view.js';

/**
 * Decision persistence (the ONLY Prisma layer of the decision domain). Returns projected rows and
 * never touches the wire format (mirrors `task.repo`). Every read is workspace-scoped by the caller
 * (a foreign id reads as not-found — no leak). Project-visibility narrowing for a plain MEMBER is
 * expressed ONCE here (mirrors `task.repo.listAssignedToMe`) so the vault can never leak a decision
 * that lives inside a PRIVATE project the caller cannot see. Multi-record writes (decision +
 * alternatives + references + participants + history) run inside a single transaction.
 */

// ---- projection plumbing ----

const DATE_SORTS: readonly DecisionSortField[] = ['createdAt', 'updatedAt'];

type RawDecisionBase = {
  id: string;
  workspaceId: string;
  title: string;
  summary: string | null;
  background: string | null;
  decision: string | null;
  rationale: string | null;
  consequences: string | null;
  status: DecisionStatus;
  category: DecisionCategory;
  source: DecisionSource;
  preArchiveStatus: DecisionStatus | null;
  projectId: string | null;
  conversationId: string | null;
  taskId: string | null;
  supersededById: string | null;
  supersededBy: { title: string } | null;
  createdAt: Date;
  updatedAt: Date;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  supersededAt: Date | null;
  archivedAt: Date | null;
  createdBy: { id: string; name: string };
  owner: { id: string; name: string };
  project: { id: string; name: string } | null;
  conversation: { id: string; title: string | null } | null;
  task: { id: string; title: string } | null;
  participants: { userId: string; user: { name: string; avatarUrl: string | null } }[];
};

/** The shared read shape: creator + owner + supersede-target + the three context links + roster. */
const baseSelect = {
  id: true,
  workspaceId: true,
  title: true,
  summary: true,
  background: true,
  decision: true,
  rationale: true,
  consequences: true,
  status: true,
  category: true,
  source: true,
  preArchiveStatus: true,
  projectId: true,
  conversationId: true,
  taskId: true,
  supersededById: true,
  supersededBy: { select: { title: true } },
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
  rejectedAt: true,
  supersededAt: true,
  archivedAt: true,
  createdBy: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
  conversation: { select: { id: true, title: true } },
  task: { select: { id: true, title: true } },
  participants: { select: { userId: true, user: { select: { name: true, avatarUrl: true } } } },
} as const satisfies Prisma.DecisionSelect;

const detailSelect = {
  ...baseSelect,
  alternatives: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      label: true,
      description: true,
      advantages: true,
      disadvantages: true,
      rejectionReason: true,
      chosen: true,
    },
  },
  references: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, type: true, label: true, url: true, entityId: true },
  },
} as const satisfies Prisma.DecisionSelect;

type RawDecisionDetail = RawDecisionBase & {
  alternatives: DecisionAlternativeRow[];
  references: Omit<DecisionReferenceRow, 'resolvedLabel'>[];
};

/** Normalize the joined links into the single live `context` summary the view carries. */
function toDecisionRow(r: RawDecisionBase): DecisionRow {
  const context = r.project
    ? { kind: 'PROJECT' as const, id: r.project.id, label: r.project.name }
    : r.conversation
      ? {
          kind: 'CONVERSATION' as const,
          id: r.conversation.id,
          label: r.conversation.title ?? 'Conversation',
        }
      : r.task
        ? { kind: 'TASK' as const, id: r.task.id, label: r.task.title }
        : null;
  const {
    project: _project,
    conversation: _conversation,
    task: _task,
    supersededBy,
    participants,
    ...rest
  } = r;
  return {
    ...rest,
    supersededByTitle: supersededBy?.title ?? null,
    context,
    participants: participants.map((p) => ({
      userId: p.userId,
      name: p.user.name,
      avatarUrl: p.user.avatarUrl,
    })),
  };
}

/**
 * Resolve TASK/CONVERSATION/DECISION references against the workspace (the DB cannot express a
 * polymorphic FK, so the repo does it): an entity that no longer exists reads with
 * `resolvedLabel: null` — the reference row itself is kept (evidence survives; the link simply no
 * longer resolves).
 */
async function resolveReferenceLabels(
  workspaceId: string,
  refs: RawDecisionDetail['references'],
): Promise<DecisionReferenceRow[]> {
  const taskIds = refs
    .filter((x) => x.type === 'TASK' && x.entityId)
    .map((x) => x.entityId as string);
  const conversationIds = refs
    .filter((x) => x.type === 'CONVERSATION' && x.entityId)
    .map((x) => x.entityId as string);
  const decisionIds = refs
    .filter((x) => x.type === 'DECISION' && x.entityId)
    .map((x) => x.entityId as string);
  const [tasks, conversations, decisions] = await Promise.all([
    taskIds.length > 0
      ? prisma.task.findMany({
          where: { id: { in: taskIds }, workspaceId },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
    conversationIds.length > 0
      ? prisma.workspaceConversation.findMany({
          where: { id: { in: conversationIds }, workspaceId },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
    decisionIds.length > 0
      ? prisma.decision.findMany({
          where: { id: { in: decisionIds }, workspaceId },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
  ]);
  const byId = new Map<string, string>([
    ...tasks.map((t) => [t.id, t.title] as const),
    ...conversations.map((c) => [c.id, c.title ?? 'Conversation'] as const),
    ...decisions.map((d) => [d.id, d.title] as const),
  ]);
  return refs.map((x) => ({
    ...x,
    resolvedLabel:
      (x.type === 'TASK' || x.type === 'CONVERSATION' || x.type === 'DECISION') && x.entityId
        ? (byId.get(x.entityId) ?? null)
        : null,
  }));
}

async function toDecisionDetailRow(r: RawDecisionDetail): Promise<DecisionDetailRow> {
  const base = toDecisionRow(r);
  return {
    ...base,
    alternatives: r.alternatives,
    references: await resolveReferenceLabels(r.workspaceId, r.references),
  };
}

// ---- writes ----

/** A pre-rendered history event the service decided on; the repo only persists it. */
export interface HistoryWrite {
  type: DecisionHistoryType;
  message: string;
}

export interface AlternativeWrite {
  label: string;
  description: string | null;
  advantages: string | null;
  disadvantages: string | null;
  rejectionReason: string | null;
  chosen: boolean;
}

export interface ReferenceWrite {
  type: DecisionReferenceType;
  label: string;
  url: string | null;
  entityId: string | null;
}

export interface CreateDecisionData {
  workspaceId: string;
  title: string;
  summary: string | null;
  background: string | null;
  decision: string | null;
  rationale: string | null;
  consequences: string | null;
  status: DecisionStatus;
  category: DecisionCategory;
  source: DecisionSource;
  projectId: string | null;
  conversationId: string | null;
  taskId: string | null;
  createdById: string;
  ownerId: string;
  participantUserIds: string[];
  alternatives: AlternativeWrite[];
  references: ReferenceWrite[];
  history: HistoryWrite[];
}

/** Persist the decision with its owned sets + creator-participant + first history rows, atomically. */
export async function createDecision(data: CreateDecisionData): Promise<DecisionDetailRow> {
  const { alternatives, references, participantUserIds, history, ...fields } = data;
  const created = await prisma.decision.create({
    data: {
      ...fields,
      alternatives: { createMany: { data: alternatives } },
      references: { createMany: { data: references } },
      participants: { createMany: { data: participantUserIds.map((userId) => ({ userId })) } },
      history: {
        createMany: {
          data: history.map((h) => ({
            ...h,
            workspaceId: fields.workspaceId,
            actorId: fields.createdById,
          })),
        },
      },
    },
    select: detailSelect,
  });
  return toDecisionDetailRow(created as unknown as RawDecisionDetail);
}

/** A decision by id, workspace-scoped, as the full detail row (null = foreign or missing). */
export async function findDecision(
  decisionId: string,
  workspaceId: string,
): Promise<DecisionDetailRow | null> {
  const row = await prisma.decision.findFirst({
    where: { id: decisionId, workspaceId },
    select: detailSelect,
  });
  return row ? toDecisionDetailRow(row as unknown as RawDecisionDetail) : null;
}

/** The bare fields the service needs for authorization + lifecycle, without any joins. */
export async function findDecisionAuthFields(
  decisionId: string,
  workspaceId: string,
): Promise<{
  id: string;
  projectId: string | null;
  createdById: string;
  status: DecisionStatus;
  decision: string | null;
  title: string;
} | null> {
  const row = await prisma.decision.findFirst({
    where: { id: decisionId, workspaceId },
    select: {
      id: true,
      projectId: true,
      createdById: true,
      status: true,
      decision: true,
      title: true,
    },
  });
  return row;
}

/**
 * Patch fields where `null` means "store NULL" and `undefined` means "leave unchanged" — the repo
 * receives only the keys the service explicitly decided to write.
 */
export interface DecisionUpdateFields {
  title?: string;
  summary?: string | null;
  background?: string | null;
  decision?: string | null;
  rationale?: string | null;
  consequences?: string | null;
  status?: DecisionStatus;
  category?: DecisionCategory;
  ownerId?: string;
  approvedAt?: Date | null;
  rejectedAt?: Date | null;
  supersededAt?: Date | null;
  archivedAt?: Date | null;
  preArchiveStatus?: DecisionStatus | null;
  supersededById?: string | null;
}

export interface UpdateDecisionData {
  data: DecisionUpdateFields;
  history: HistoryWrite[];
  /** REPLACE semantics: when set, the alternatives table for this decision becomes exactly this set. */
  alternatives?: AlternativeWrite[];
  /** REPLACE semantics: when set, the references table for this decision becomes exactly this set. */
  references?: ReferenceWrite[];
}

/** Apply a field patch (+ optional replaced owned sets + history rows) atomically; re-read the detail. */
export async function updateDecision(
  decisionId: string,
  workspaceId: string,
  actorId: string,
  update: UpdateDecisionData,
): Promise<DecisionDetailRow> {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.decision.update({ where: { id: decisionId }, data: update.data });
    if (update.alternatives) {
      await tx.decisionAlternative.deleteMany({ where: { decisionId } });
      if (update.alternatives.length > 0) {
        await tx.decisionAlternative.createMany({
          data: update.alternatives.map((a) => ({ decisionId, ...a })),
        });
      }
    }
    if (update.references) {
      await tx.decisionReference.deleteMany({ where: { decisionId } });
      if (update.references.length > 0) {
        await tx.decisionReference.createMany({
          data: update.references.map((r) => ({ decisionId, ...r })),
        });
      }
    }
    if (update.history.length > 0) {
      await tx.decisionHistory.createMany({
        data: update.history.map((h) => ({ decisionId, workspaceId, actorId, ...h })),
      });
    }
  });
  const row = await prisma.decision.findUniqueOrThrow({
    where: { id: decisionId },
    select: detailSelect,
  });
  return toDecisionDetailRow(row as unknown as RawDecisionDetail);
}

/** FK Cascade removes the decision's alternatives, references, participants, comments and history. */
export async function deleteDecision(decisionId: string): Promise<void> {
  await prisma.decision.delete({ where: { id: decisionId } });
}

/** Does a project / conversation / task / decision with this id live in this workspace? (link + ref validation) */
export async function entityInWorkspace(
  kind: 'PROJECT' | 'CONVERSATION' | 'TASK' | 'DECISION',
  entityId: string,
  workspaceId: string,
): Promise<boolean> {
  if (kind === 'PROJECT') {
    return (await prisma.project.count({ where: { id: entityId, workspaceId } })) === 1;
  }
  if (kind === 'CONVERSATION') {
    return (
      (await prisma.workspaceConversation.count({ where: { id: entityId, workspaceId } })) === 1
    );
  }
  if (kind === 'DECISION') {
    return (await prisma.decision.count({ where: { id: entityId, workspaceId } })) === 1;
  }
  return (await prisma.task.count({ where: { id: entityId, workspaceId } })) === 1;
}

/** The project a decision belongs to (null = workspace-level), for the manage-gate lookup. */
export async function projectVisibilityFor(
  projectId: string,
): Promise<{ visibility: 'WORKSPACE' | 'PRIVATE'; ownerId: string; createdById: string } | null> {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: { visibility: true, ownerId: true, createdById: true },
  });
}

// ---- participants ----

/** Add one participant (idempotent at the unique constraint) and write the history row atomically. */
export async function addParticipant(
  decisionId: string,
  workspaceId: string,
  actorId: string,
  userId: string,
  history: HistoryWrite,
): Promise<void> {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.decisionParticipant.findUnique({
      where: { decisionId_userId: { decisionId, userId } },
      select: { id: true },
    });
    if (!existing) {
      await tx.decisionParticipant.create({ data: { decisionId, userId } });
      await tx.decisionHistory.create({ data: { decisionId, workspaceId, actorId, ...history } });
    }
  });
}

/** Remove one participant and write the history row atomically (no-op when absent). */
export async function removeParticipant(
  decisionId: string,
  workspaceId: string,
  actorId: string,
  userId: string,
  history: HistoryWrite,
): Promise<void> {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const deleted = await tx.decisionParticipant.deleteMany({ where: { decisionId, userId } });
    if (deleted.count > 0) {
      await tx.decisionHistory.create({ data: { decisionId, workspaceId, actorId, ...history } });
    }
  });
}

/** Public name of a user, for composing a participant history message (never email). */
export async function getUserBrief(userId: string): Promise<{ id: string; name: string } | null> {
  return prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
}

// ---- comments ----

export async function createComment(
  decisionId: string,
  workspaceId: string,
  authorId: string,
  body: string,
): Promise<DecisionCommentRow> {
  const row = await prisma.decisionComment.create({
    data: { decisionId, workspaceId, authorId, body },
    select: {
      id: true,
      body: true,
      createdAt: true,
      updatedAt: true,
      author: { select: { id: true, name: true } },
    },
  });
  return row;
}

/** Delete a comment (already scoped to decision + workspace by the caller's own gate). */
export async function deleteComment(commentId: string, decisionId: string): Promise<boolean> {
  const deleted = await prisma.decisionComment.deleteMany({ where: { id: commentId, decisionId } });
  return deleted.count > 0;
}

export async function findComment(
  commentId: string,
  decisionId: string,
  workspaceId: string,
): Promise<{ id: string; authorId: string } | null> {
  return prisma.decisionComment.findFirst({
    where: { id: commentId, decisionId, workspaceId },
    select: { id: true, authorId: true },
  });
}

// ---- list (filters + visibility narrowing + keyset cursor) ----

export interface ListDecisionsParams {
  workspaceId: string;
  callerRole: WorkspaceRole;
  callerId: string;
  status: DecisionStatus | undefined;
  category: DecisionCategory | undefined;
  projectId: string | undefined;
  source: DecisionSource | undefined;
  participantId: string | undefined;
  ownerId: string | undefined;
  search: string | undefined;
  sort: DecisionSortField;
  dir: 'asc' | 'desc';
  limit: number;
  cursor: string | undefined;
}

function encodeCursor(row: { [k: string]: unknown; id: string }, sort: DecisionSortField): string {
  const raw = row[sort];
  const value = raw instanceof Date ? raw.toISOString() : raw == null ? '' : String(raw);
  return Buffer.from(JSON.stringify({ v: value, id: row.id }), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { v: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { v?: unknown }).v === 'string' &&
      typeof (parsed as { id?: unknown }).id === 'string'
    ) {
      return parsed as { v: string; id: string };
    }
    return null;
  } catch {
    return null;
  }
}

export async function listDecisions(
  params: ListDecisionsParams,
): Promise<{ rows: DecisionRow[]; nextCursor: string | null }> {
  const {
    workspaceId,
    callerRole,
    callerId,
    status,
    category,
    projectId,
    source,
    participantId,
    ownerId,
    search,
    sort,
    dir,
    limit,
    cursor,
  } = params;

  const where: Prisma.DecisionWhereInput = { workspaceId };
  const and: Prisma.DecisionWhereInput[] = [];

  if (status) where.status = status;
  if (category) where.category = category;
  // A project's Decisions section shows decisions linked to the project ITSELF and to its tasks —
  // the single-link model keeps provenance honest while the project remains the natural grouping.
  if (projectId) {
    where.OR = [{ projectId }, { task: { projectId } }];
  }
  if (source) where.source = source;
  if (participantId) where.participants = { some: { userId: participantId } };
  if (ownerId) where.ownerId = ownerId;
  if (search) {
    // Lives in AND so it never clobbers the projectId filter's OR (both may apply at once).
    and.push({
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { summary: { contains: search, mode: 'insensitive' } },
        { decision: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  // Visibility narrowing (mirrors task.repo.listAssignedToMe): a plain MEMBER never sees a decision
  // that lives inside a PRIVATE project they neither own nor created. Linkless (workspace-level)
  // decisions are visible to every member. OWNER/ADMIN see everything in the workspace.
  if (callerRole === 'MEMBER') {
    and.push({
      OR: [
        { projectId: null },
        { project: { visibility: 'WORKSPACE' } },
        { project: { ownerId: callerId } },
        { project: { createdById: callerId } },
      ],
    });
  }

  const decoded = cursor ? decodeCursor(cursor) : null;
  if (decoded) {
    const isDate = DATE_SORTS.includes(sort);
    const cmpVal: string | Date = isDate && decoded.v ? new Date(decoded.v) : decoded.v;
    const gt: Prisma.DecisionWhereInput = {
      OR: [{ [sort]: { gt: cmpVal } }, { AND: [{ [sort]: cmpVal }, { id: { gt: decoded.id } }] }],
    };
    const lt: Prisma.DecisionWhereInput = {
      OR: [{ [sort]: { lt: cmpVal } }, { AND: [{ [sort]: cmpVal }, { id: { lt: decoded.id } }] }],
    };
    and.push(dir === 'asc' ? gt : lt);
  }
  if (and.length > 0) where.AND = and;

  const rows = await prisma.decision.findMany({
    where,
    select: baseSelect,
    orderBy: [{ [sort]: dir }, { id: dir }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1] as unknown as RawDecisionBase | undefined;

  return {
    rows: page.map((r) => toDecisionRow(r as unknown as RawDecisionBase)),
    nextCursor:
      hasMore && last
        ? encodeCursor(last as unknown as { [k: string]: unknown; id: string }, sort)
        : null,
  };
}

// ---- history + comment feeds (time-ordered keyset cursor) ----

const feedCursor = (last: { createdAt: Date; id: string }): string =>
  Buffer.from(JSON.stringify({ v: last.createdAt.toISOString(), id: last.id }), 'utf8').toString(
    'base64url',
  );

export async function listHistory(
  decisionId: string,
  limit: number,
  cursor: string | undefined,
): Promise<{ rows: DecisionHistoryRow[]; nextCursor: string | null }> {
  const where: Prisma.DecisionHistoryWhereInput = { decisionId };
  const decoded = cursor ? decodeCursor(cursor) : null;
  if (decoded) {
    const seenAt = new Date(decoded.v);
    where.AND = [
      {
        OR: [
          { createdAt: { lt: seenAt } },
          { AND: [{ createdAt: seenAt }, { id: { lt: decoded.id } }] },
        ],
      },
    ];
  }

  const rows = await prisma.decisionHistory.findMany({
    where,
    select: {
      id: true,
      type: true,
      message: true,
      createdAt: true,
      actor: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return { rows: page, nextCursor: hasMore && last ? feedCursor(last) : null };
}

export async function listComments(
  decisionId: string,
  limit: number,
  cursor: string | undefined,
): Promise<{ rows: DecisionCommentRow[]; nextCursor: string | null }> {
  const where: Prisma.DecisionCommentWhereInput = { decisionId };
  const decoded = cursor ? decodeCursor(cursor) : null;
  if (decoded) {
    const seenAt = new Date(decoded.v);
    where.AND = [
      {
        OR: [
          { createdAt: { lt: seenAt } },
          { AND: [{ createdAt: seenAt }, { id: { lt: decoded.id } }] },
        ],
      },
    ];
  }

  const rows = await prisma.decisionComment.findMany({
    where,
    select: {
      id: true,
      body: true,
      createdAt: true,
      updatedAt: true,
      author: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return { rows: page, nextCursor: hasMore && last ? feedCursor(last) : null };
}
