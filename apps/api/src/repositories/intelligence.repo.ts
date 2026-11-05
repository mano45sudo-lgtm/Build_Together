import type { DecisionStatus, TaskPriority, TaskStatus } from '@buildtogether/shared';
import { prisma } from '../lib/prisma.js';

/**
 * Execution-intelligence persistence (Phase 7). This is the ONLY Prisma layer of the intelligence
 * domain (backend-engineering). It reads the *raw signals* the deterministic engine computes over and
 * persists the two genuinely-durable things — a user's dismissal of a computed signal, and
 * (separately) notifications. It deliberately does NOT store the derived insights themselves: health,
 * blockers, risks and recommendations are recomputed on read from live data so they can never drift.
 *
 * Every read is workspace-scoped by the caller; project-visibility narrowing happens one layer up (the
 * orchestrator authorizes the project via the existing project service before asking for its signals),
 * so this repo only ever receives a workspace + project the caller is allowed to see.
 */

// ---- Raw signal shapes (repository → pure detector input; no wire format here) ----

export interface PrerequisiteSignal {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: Date | null;
}

export interface TaskSignal {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  assignee: { id: string; name: string } | null;
  /** Unfinished (not DONE) prerequisites — the derived blocker source (mirrors task.repo `blocked`). */
  prerequisites: PrerequisiteSignal[];
  /** How many times the due date changed (TaskActivity DUE_DATE_CHANGED) — a deadline-slip signal. */
  dueDateChanges: number;
}

export interface DecisionSignal {
  id: string;
  title: string;
  status: DecisionStatus;
  projectId: string | null;
  /** Direct task link (Decision.taskId). */
  taskId: string | null;
  /** Every task this decision references (direct link + TASK-type references), de-duplicated. */
  linkedTaskIds: string[];
  supersededById: string | null;
  supersededByTitle: string | null;
  supersededAt: Date | null;
}

export interface ProjectSignals {
  project: {
    id: string;
    name: string;
    projectKey: string;
    status: string;
    targetDate: Date | null;
  };
  tasks: TaskSignal[];
  decisions: DecisionSignal[];
}

/**
 * Read the task + decision signals for one (authorized) project. Tasks carry their unfinished
 * prerequisites (for blocked/overdue-dependency detection) and a due-date-change count (deadline-slip
 * signal); decisions carry their supersede link + every task they touch (for decision-impact).
 * Bounded to the project's workspace so an id alone can never reach foreign data.
 */
export async function getProjectSignals(
  workspaceId: string,
  projectId: string,
): Promise<ProjectSignals> {
  const [project, tasksRaw, decisionsRaw, dueChangeGroups] = await Promise.all([
    prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true, name: true, projectKey: true, status: true, targetDate: true },
    }),
    prisma.task.findMany({
      where: { workspaceId, projectId },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        createdAt: true,
        completedAt: true,
        assignee: { select: { id: true, name: true } },
        dependenciesIn: {
          where: { dependsOnTask: { status: { not: 'DONE' } } },
          select: {
            dependsOnTask: { select: { id: true, title: true, status: true, dueDate: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    }),
    prisma.decision.findMany({
      where: { workspaceId, projectId },
      select: {
        id: true,
        title: true,
        status: true,
        projectId: true,
        taskId: true,
        supersededById: true,
        supersededAt: true,
        supersededBy: { select: { id: true, title: true } },
        references: { where: { type: 'TASK' }, select: { entityId: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    }),
    prisma.taskActivity.groupBy({
      by: ['taskId'],
      where: { workspaceId, projectId, type: 'DUE_DATE_CHANGED' },
      _count: { _all: true },
    }),
  ]);

  if (!project) {
    // The orchestrator authorizes the project before calling; a miss here is a race (deleted since).
    return {
      project: { id: projectId, name: '', projectKey: '', status: '', targetDate: null },
      tasks: [],
      decisions: [],
    };
  }

  const dueChangesByTask = new Map<string, number>();
  for (const g of dueChangeGroups) dueChangesByTask.set(g.taskId, g._count._all);

  const tasks: TaskSignal[] = tasksRaw.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority as TaskPriority,
    dueDate: t.dueDate,
    createdAt: t.createdAt,
    completedAt: t.completedAt,
    assignee: t.assignee,
    prerequisites: t.dependenciesIn.map((d) => d.dependsOnTask),
    dueDateChanges: dueChangesByTask.get(t.id) ?? 0,
  }));

  const decisions: DecisionSignal[] = decisionsRaw.map((d) => {
    const linked = new Set<string>();
    if (d.taskId) linked.add(d.taskId);
    for (const r of d.references) if (r.entityId) linked.add(r.entityId);
    return {
      id: d.id,
      title: d.title,
      status: d.status as DecisionStatus,
      projectId: d.projectId,
      taskId: d.taskId,
      linkedTaskIds: [...linked],
      supersededById: d.supersededById,
      supersededByTitle: d.supersededBy?.title ?? null,
      supersededAt: d.supersededAt,
    };
  });

  return {
    project: {
      id: project.id,
      name: project.name,
      projectKey: project.projectKey,
      status: project.status,
      targetDate: project.targetDate,
    },
    tasks,
    decisions,
  };
}

/** The titles + status of a set of tasks, workspace-scoped — used to explain decision-impact. */
export async function getTaskBriefsByIds(
  workspaceId: string,
  taskIds: string[],
): Promise<
  Map<string, { id: string; title: string; status: TaskStatus; assigneeName: string | null }>
> {
  const map = new Map<
    string,
    { id: string; title: string; status: TaskStatus; assigneeName: string | null }
  >();
  if (taskIds.length === 0) return map;
  const rows = await prisma.task.findMany({
    where: { id: { in: taskIds }, workspaceId },
    select: { id: true, title: true, status: true, assignee: { select: { name: true } } },
  });
  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      title: r.title,
      status: r.status as TaskStatus,
      assigneeName: r.assignee?.name ?? null,
    });
  }
  return map;
}

// ---- Dismissals (persisted user state on computed signals) ----

export interface DismissalRow {
  kind: 'RECOMMENDATION' | 'BLOCKER' | 'RISK';
  dedupKey: string;
  state: 'DISMISSED' | 'RESOLVED';
  updatedAt: Date;
}

/** The dismissal keys this user has recorded in this workspace, as a `kind:dedupKey` set for fast filter. */
export async function getDismissalKeys(workspaceId: string, userId: string): Promise<Set<string>> {
  const rows = await prisma.intelligenceDismissal.findMany({
    where: { workspaceId, userId },
    select: { kind: true, dedupKey: true },
  });
  return new Set(rows.map((r) => `${r.kind}:${r.dedupKey}`));
}

/** Full dismissal rows for the user (the view returned after a write). */
export async function listDismissals(workspaceId: string, userId: string): Promise<DismissalRow[]> {
  const rows = await prisma.intelligenceDismissal.findMany({
    where: { workspaceId, userId },
    select: { kind: true, dedupKey: true, state: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map((r) => ({
    kind: r.kind as DismissalRow['kind'],
    dedupKey: r.dedupKey,
    state: r.state as DismissalState,
    updatedAt: r.updatedAt,
  }));
}

/**
 * Record (or re-state) a dismissal idempotently. The unique key (workspace, user, kind, dedupKey) means
 * re-dismissing the same signal updates the state rather than duplicating it — the DB enforces the
 * deduplication the brief requires, not an application check alone.
 */
export async function upsertDismissal(
  workspaceId: string,
  userId: string,
  data: { kind: DismissalRow['kind']; dedupKey: string; state: DismissalRow['state'] },
): Promise<DismissalRow> {
  const row = await prisma.intelligenceDismissal.upsert({
    where: {
      workspaceId_userId_kind_dedupKey: {
        workspaceId,
        userId,
        kind: data.kind,
        dedupKey: data.dedupKey,
      },
    },
    create: { workspaceId, userId, kind: data.kind, dedupKey: data.dedupKey, state: data.state },
    update: { state: data.state },
    select: { kind: true, dedupKey: true, state: true, updatedAt: true },
  });
  return {
    kind: row.kind as DismissalRow['kind'],
    dedupKey: row.dedupKey,
    state: row.state as DismissalState,
    updatedAt: row.updatedAt,
  };
}

/** Remove a dismissal (un-dismiss), so the signal resurfaces on the next read. */
export async function deleteDismissal(
  workspaceId: string,
  userId: string,
  kind: DismissalRow['kind'],
  dedupKey: string,
): Promise<void> {
  await prisma.intelligenceDismissal.deleteMany({ where: { workspaceId, userId, kind, dedupKey } });
}

// Narrow the ambient Prisma enum types to the shared string unions at the boundary.
type DismissalState = 'DISMISSED' | 'RESOLVED';
