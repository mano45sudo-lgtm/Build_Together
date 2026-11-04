import type {
  AuthSessionView,
  ConversationKind,
  ConversationSummary,
  DecisionAlternativeView,
  DecisionCommentView,
  DecisionDetailView,
  DecisionHistoryType,
  DecisionHistoryView,
  DecisionReferenceType,
  DecisionReferenceView,
  DecisionSource,
  DecisionStatus,
  DecisionView,
  InvitationStatus,
  InvitationSummary,
  MemberSummary,
  MyTaskView,
  ProjectStatus,
  ProjectVisibility,
  ProjectView,
  PublicUser,
  TaskActivityType,
  TaskActivityView,
  TaskPriority,
  TaskStatus,
  TaskView,
  WorkspaceRole,
  WorkspaceSummary,
} from '@buildtogether/shared';

/**
 * Presentation mappers (repository row → shared DTO). Kept separate from repositories so the
 * Prisma→wire translation is the single place dates are serialized and the password hash and raw
 * tokens are guaranteed to be dropped. Only ever receives already-scoped, already-authorized rows.
 */

/** The wire-safe subset of a Prisma `User` (never carries the password hash). */
export interface UserRecord {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: Date;
}

/** A membership row joined with its workspace summary + member count. */
export interface MembershipWithWorkspace {
  role: WorkspaceRole;
  createdAt: Date;
  workspace: {
    id: string;
    name: string;
    description: string | null;
    iconUrl: string | null;
    createdAt: Date;
    _count: { memberships: number };
  };
}

/** A membership row joined with the member's user record. */
export interface MemberRow {
  role: WorkspaceRole;
  createdAt: Date;
  user: UserRecord;
}

/** An invitation row joined with its inviter name. */
export interface InvitationRow {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  invitedBy: { name: string };
}

const iso = (d: Date): string => d.toISOString();

export function toPublicUser(u: UserRecord): PublicUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatarUrl: u.avatarUrl,
    status: u.status,
    createdAt: iso(u.createdAt),
  };
}

export function toWorkspaceSummary(m: MembershipWithWorkspace): WorkspaceSummary {
  return {
    id: m.workspace.id,
    name: m.workspace.name,
    description: m.workspace.description,
    iconUrl: m.workspace.iconUrl,
    role: m.role,
    memberCount: m.workspace._count.memberships,
    createdAt: iso(m.workspace.createdAt),
  };
}

export function toMemberSummary(row: MemberRow): MemberSummary {
  return {
    userId: row.user.id,
    name: row.user.name,
    email: row.user.email,
    avatarUrl: row.user.avatarUrl,
    role: row.role,
    joinedAt: iso(row.createdAt),
  };
}

export function toInvitationSummary(inv: InvitationRow): InvitationSummary {
  return {
    id: inv.id,
    email: inv.email,
    role: inv.role,
    status: inv.status,
    invitedBy: inv.invitedBy.name,
    createdAt: iso(inv.createdAt),
    expiresAt: iso(inv.expiresAt),
    acceptedAt: inv.acceptedAt ? iso(inv.acceptedAt) : null,
  };
}

export function buildSessionView(
  user: UserRecord,
  memberships: MembershipWithWorkspace[],
): AuthSessionView {
  return {
    user: toPublicUser(user),
    workspaces: memberships.map(toWorkspaceSummary),
  };
}

// ---- Phase 3 chat projections (ADR-0004). Receiving row shapes live here so date + null handling
// stays in one place; the chat repository returns these shapes and never touches the wire format. ----

/** A conversation participant row (user + its Nexconn mapping, already joined). */
export interface ConversationParticipantRow {
  userId: string;
  name: string;
  avatarUrl: string | null;
  externalId: string;
}

/** A conversation row joined with its participants (repository → projection input). */
export interface ConversationRow {
  id: string;
  workspaceId: string;
  kind: ConversationKind;
  title: string | null;
  providerChannelId: string | null;
  createdAt: Date;
  participants: ConversationParticipantRow[];
}

export function toConversationSummary(c: ConversationRow): ConversationSummary {
  return {
    id: c.id,
    kind: c.kind,
    providerChannelId: c.providerChannelId,
    title: c.title,
    workspaceId: c.workspaceId,
    participants: c.participants.map((p) => ({
      userId: p.userId,
      name: p.name,
      avatarUrl: p.avatarUrl,
      externalId: p.externalId,
    })),
    createdAt: iso(c.createdAt),
  };
}

// ---- Phase 4 project projections ----

/** A project row joined with its owner (and optionally its workspace), as the repository returns it. */
export interface ProjectRow {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  projectKey: string;
  status: ProjectStatus;
  visibility: ProjectVisibility;
  ownerId: string;
  createdById: string;
  startDate: Date | null;
  targetDate: Date | null;
  icon: string | null;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
  owner: { id: string; name: string; avatarUrl: string | null };
}

const dateOrNull = (d: Date | null): string | null => (d ? iso(d) : null);

export function toProjectView(p: ProjectRow): ProjectView {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    name: p.name,
    slug: p.slug,
    description: p.description,
    projectKey: p.projectKey,
    status: p.status,
    visibility: p.visibility,
    owner: { id: p.owner.id, name: p.owner.name, avatarUrl: p.owner.avatarUrl },
    createdById: p.createdById,
    startDate: dateOrNull(p.startDate),
    targetDate: dateOrNull(p.targetDate),
    icon: p.icon,
    color: p.color,
    createdAt: iso(p.createdAt),
    updatedAt: iso(p.updatedAt),
    archivedAt: dateOrNull(p.archivedAt),
  };
}

// ---- Phase 5 task projections ----

/**
 * A task row as the repository returns it: owner/creator/assignee hydrated, `blocked` pre-computed
 * (an unfinished prerequisite exists). Dates are `Date | null` here and serialized only at the wire.
 */
export interface TaskRow {
  id: string;
  workspaceId: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  createdById: string;
  startDate: Date | null;
  dueDate: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string };
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  blocked: boolean;
}

/** A task row joined with its project summary — the shape My Work needs to show + navigate context. */
export interface MyTaskRow extends TaskRow {
  project: { id: string; name: string; projectKey: string };
}

/** One activity timeline row, joined with the acting user's name. */
export interface TaskActivityRow {
  id: string;
  type: TaskActivityType;
  message: string;
  createdAt: Date;
  actor: { id: string; name: string };
}

export function toTaskView(t: TaskRow): TaskView {
  return {
    id: t.id,
    workspaceId: t.workspaceId,
    projectId: t.projectId,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    createdBy: { id: t.createdBy.id, name: t.createdBy.name },
    assignee: t.assignee
      ? { id: t.assignee.id, name: t.assignee.name, avatarUrl: t.assignee.avatarUrl }
      : null,
    startDate: dateOrNull(t.startDate),
    dueDate: dateOrNull(t.dueDate),
    completedAt: dateOrNull(t.completedAt),
    createdAt: iso(t.createdAt),
    updatedAt: iso(t.updatedAt),
    blocked: t.blocked,
  };
}

export function toMyTaskView(t: MyTaskRow): MyTaskView {
  return {
    ...toTaskView(t),
    project: { id: t.project.id, name: t.project.name, projectKey: t.project.projectKey },
  };
}

export function toTaskActivityView(a: TaskActivityRow): TaskActivityView {
  return {
    id: a.id,
    type: a.type,
    actor: { id: a.actor.id, name: a.actor.name },
    message: a.message,
    createdAt: iso(a.createdAt),
  };
}

// ---- Phase 6 Decision Vault projections ----

/** A participant row (the DecisionParticipant join with the user's display fields). */
export interface DecisionParticipantRow {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

/** An owned alternative row, as the repository returns it. */
export interface DecisionAlternativeRow {
  id: string;
  label: string;
  description: string | null;
  chosen: boolean;
}

/** A cited reference row; `resolvedLabel` is filled by the repo for TASK/CONVERSATION entity refs. */
export interface DecisionReferenceRow {
  id: string;
  type: DecisionReferenceType;
  label: string;
  url: string | null;
  entityId: string | null;
  resolvedLabel: string | null;
}

/**
 * A decision row as the repository returns it: creator hydrated, the live context summary resolved
 * from whichever link is present (null when the context was removed — SetNull keeps the decision),
 * and the participant roster joined. Dates are `Date | null` here and serialized only at the wire.
 */
export interface DecisionRow {
  id: string;
  workspaceId: string;
  title: string;
  background: string | null;
  decision: string | null;
  rationale: string | null;
  consequences: string | null;
  status: DecisionStatus;
  source: DecisionSource;
  /** NOT part of the wire DTO — the service needs it so RESTORE returns the pre-archive status. */
  preArchiveStatus: DecisionStatus | null;
  projectId: string | null;
  conversationId: string | null;
  taskId: string | null;
  supersededById: string | null;
  supersededByTitle: string | null;
  context: { kind: 'PROJECT' | 'CONVERSATION' | 'TASK'; id: string; label: string } | null;
  createdAt: Date;
  updatedAt: Date;
  finalizedAt: Date | null;
  supersededAt: Date | null;
  archivedAt: Date | null;
  createdBy: { id: string; name: string };
  participants: DecisionParticipantRow[];
}

/** The detail read: the row plus the owned sub-entity sets. */
export interface DecisionDetailRow extends DecisionRow {
  alternatives: DecisionAlternativeRow[];
  references: DecisionReferenceRow[];
}

/** One history timeline row, joined with the acting user's name. */
export interface DecisionHistoryRow {
  id: string;
  type: DecisionHistoryType;
  message: string;
  createdAt: Date;
  actor: { id: string; name: string };
}

/** One discussion comment, joined with its author. */
export interface DecisionCommentRow {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string };
}

export function toDecisionView(d: DecisionRow): DecisionView {
  return {
    id: d.id,
    workspaceId: d.workspaceId,
    title: d.title,
    background: d.background,
    decision: d.decision,
    rationale: d.rationale,
    consequences: d.consequences,
    status: d.status,
    source: d.source,
    createdBy: { id: d.createdBy.id, name: d.createdBy.name },
    projectId: d.projectId,
    conversationId: d.conversationId,
    taskId: d.taskId,
    contextSummary: d.context,
    supersededById: d.supersededById,
    supersededByTitle: d.supersededByTitle,
    participantIds: d.participants.map((p) => p.userId),
    participants: d.participants.map((p) => ({
      id: p.userId,
      name: p.name,
      avatarUrl: p.avatarUrl,
    })),
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
    finalizedAt: dateOrNull(d.finalizedAt),
    supersededAt: dateOrNull(d.supersededAt),
    archivedAt: dateOrNull(d.archivedAt),
  };
}

export function toDecisionDetailView(d: DecisionDetailRow): DecisionDetailView {
  return {
    ...toDecisionView(d),
    alternatives: d.alternatives.map(
      (a): DecisionAlternativeView => ({
        id: a.id,
        label: a.label,
        description: a.description,
        chosen: a.chosen,
      }),
    ),
    references: d.references.map(
      (r): DecisionReferenceView => ({
        id: r.id,
        type: r.type,
        label: r.label,
        url: r.url,
        entityId: r.entityId,
        resolvedLabel: r.resolvedLabel,
      }),
    ),
  };
}

export function toDecisionHistoryView(h: DecisionHistoryRow): DecisionHistoryView {
  return {
    id: h.id,
    type: h.type,
    actor: { id: h.actor.id, name: h.actor.name },
    message: h.message,
    createdAt: iso(h.createdAt),
  };
}

export function toDecisionCommentView(c: DecisionCommentRow): DecisionCommentView {
  return {
    id: c.id,
    author: { id: c.author.id, name: c.author.name },
    body: c.body,
    createdAt: iso(c.createdAt),
    updatedAt: iso(c.updatedAt),
  };
}
