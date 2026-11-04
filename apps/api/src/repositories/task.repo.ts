import type {
  TaskActivityType,
  TaskPriority,
  TaskSortField,
  TaskStatus,
  WorkspaceRole,
} from '@buildtogether/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import type { MyTaskRow, TaskActivityRow, TaskRow } from '../lib/view.js';

/**
 * Task persistence (the ONLY Prisma layer of the task domain). Returns projected rows and never touches
 * the wire format. Every read is workspace-scoped by the caller (cross-workspace id → not-found). The
 * `blocked` flag is DERIVED here from an unfinished prerequisite edge, so it can never drift from the
 * real dependency graph. Multi-record writes (task + activity + edges) run inside a single transaction
 * so a task is never left half-recorded (backend-engineering rule).
 */

const DATE_SORTS: readonly TaskSortField[] = ['createdAt', 'updatedAt', 'dueDate'];

/** Hydrates creator + assignee and computes `blocked` (≥1 prerequisite not DONE) in one round-trip. */
const taskSelect = {
  id: true,
  workspaceId: true,
  projectId: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  createdById: true,
  startDate: true,
  dueDate: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, avatarUrl: true } },
  dependenciesIn: {
    where: { dependsOnTask: { status: { not: 'DONE' } } },
    select: { id: true },
  },
} as const satisfies Prisma.TaskSelect;

type RawTask = {
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
  dependenciesIn: { id: string }[];
};

function toTaskRow(r: RawTask): TaskRow {
  const { dependenciesIn, ...rest } = r;
  return { ...rest, blocked: dependenciesIn.length > 0 };
}

/** A pre-rendered timeline event the service decided on; the repo only persists it. */
export interface ActivityWrite {
  type: TaskActivityType;
  message: string;
}

export interface CreateTaskData {
  workspaceId: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  createdById: string;
  assigneeId: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  completedAt: Date | null;
  /** Prerequisite task ids (already validated legal by the service). */
  dependencyIds: string[];
  activity: ActivityWrite[];
}

export async function createTask(data: CreateTaskData): Promise<TaskRow> {
  const { dependencyIds, activity, ...fields } = data;
  const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const taskData: Prisma.TaskUncheckedCreateInput = { ...fields };
    if (dependencyIds.length > 0) {
      taskData.dependenciesIn = {
        createMany: {
          data: dependencyIds.map((dependsOnTaskId) => ({
            workspaceId: data.workspaceId,
            dependsOnTaskId,
          })),
        },
      };
    }
    const task = await tx.task.create({ data: taskData, select: { id: true } });
    if (activity.length > 0) {
      await tx.taskActivity.createMany({
        data: activity.map((a) => ({
          workspaceId: data.workspaceId,
          projectId: data.projectId,
          taskId: task.id,
          actorId: data.createdById,
          type: a.type,
          message: a.message,
        })),
      });
    }
    return task.id;
  });
  const row = await prisma.task.findUniqueOrThrow({ where: { id: created }, select: taskSelect });
  return toTaskRow(row as unknown as RawTask);
}

/** A task by id, workspace-scoped (a task in another workspace reads as not-found — no leak). */
export async function findTask(taskId: string, workspaceId: string): Promise<TaskRow | null> {
  const row = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
    select: taskSelect,
  });
  return row ? toTaskRow(row as unknown as RawTask) : null;
}

/** The bare owner/creator of a task plus its project — used for the authorization checks in the service. */
export async function findTaskAuthFields(
  taskId: string,
  workspaceId: string,
): Promise<{ projectId: string; createdById: string; assigneeId: string | null } | null> {
  const row = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
    select: { projectId: true, createdById: true, assigneeId: true },
  });
  return row;
}

/**
 * Count how many of `taskIds` live in `projectId` AND `workspaceId`. The service asserts this equals the
 * de-duplicated id count, so a caller can never wire a dependency to a task in another project or
 * workspace (project boundary + workspace isolation in one query).
 */
export async function countTasksInProject(
  taskIds: string[],
  projectId: string,
  workspaceId: string,
): Promise<number> {
  if (taskIds.length === 0) return 0;
  return prisma.task.count({ where: { id: { in: taskIds }, projectId, workspaceId } });
}

export async function dependencyExists(taskId: string, dependsOnTaskId: string): Promise<boolean> {
  const count = await prisma.taskDependency.count({ where: { taskId, dependsOnTaskId } });
  return count > 0;
}

/** Every prerequisite edge in a project — the service runs a cycle DFS over this small graph. */
export async function getProjectEdges(
  projectId: string,
): Promise<{ taskId: string; dependsOnTaskId: string }[]> {
  const rows = await prisma.taskDependency.findMany({
    where: { task: { projectId } },
    select: { taskId: true, dependsOnTaskId: true },
  });
  return rows;
}

/** Does a prerequisite edge with this id belong to `taskId` in `workspaceId`? (guards DELETE scope). */
export async function findDependencyById(
  dependencyId: string,
  taskId: string,
  workspaceId: string,
): Promise<{ dependsOnTaskId: string } | null> {
  const row = await prisma.taskDependency.findFirst({
    where: { id: dependencyId, taskId, workspaceId },
    select: { dependsOnTaskId: true },
  });
  return row;
}

export interface TaskUpdateFields {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  startDate?: Date | null;
  dueDate?: Date | null;
  status?: TaskStatus;
  completedAt?: Date | null;
}

/** Apply a content/field patch and append its activity rows atomically, returning the re-read task. */
export async function updateTask(
  taskId: string,
  workspaceId: string,
  actorId: string,
  data: TaskUpdateFields,
  activity: ActivityWrite[],
): Promise<TaskRow> {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.task.update({ where: { id: taskId }, data });
    if (activity.length > 0) {
      const task = await tx.task.findUniqueOrThrow({
        where: { id: taskId },
        select: { projectId: true },
      });
      await tx.taskActivity.createMany({
        data: activity.map((a) => ({
          workspaceId,
          projectId: task.projectId,
          taskId,
          actorId,
          type: a.type,
          message: a.message,
        })),
      });
    }
  });
  const row = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: taskSelect });
  return toTaskRow(row as unknown as RawTask);
}

/** Reassign (or unassign) a task and log it, atomically. */
export async function setAssignee(
  taskId: string,
  workspaceId: string,
  actorId: string,
  assigneeId: string | null,
  activity: ActivityWrite,
): Promise<TaskRow> {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.task.update({ where: { id: taskId }, data: { assigneeId } });
    const task = await tx.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { projectId: true },
    });
    await tx.taskActivity.create({
      data: {
        workspaceId,
        projectId: task.projectId,
        taskId,
        actorId,
        type: activity.type,
        message: activity.message,
      },
    });
  });
  const row = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: taskSelect });
  return toTaskRow(row as unknown as RawTask);
}

export async function deleteTask(taskId: string): Promise<void> {
  // FK Cascade removes the task's dependency edges and activity rows.
  await prisma.task.delete({ where: { id: taskId } });
}

/** A dependency edge incident to `taskId`, hydrated enough for navigation + a DELETE handle. */
export interface DependencyEdgeRow {
  id: string;
  task: { id: string; title: string; status: TaskStatus };
}

export interface TaskDependencyRows {
  dependsOn: DependencyEdgeRow[];
  blocks: DependencyEdgeRow[];
}

const refSelect = { id: true, title: true, status: true } as const;

export async function getDependencies(taskId: string): Promise<TaskDependencyRows> {
  const [dependsOn, blocks] = await Promise.all([
    prisma.taskDependency.findMany({
      where: { taskId },
      select: { id: true, dependsOnTask: { select: refSelect } },
    }),
    prisma.taskDependency.findMany({
      where: { dependsOnTaskId: taskId },
      select: { task: { select: refSelect } },
    }),
  ]);
  return {
    dependsOn: dependsOn.map((e) => ({ id: e.id, task: e.dependsOnTask })),
    blocks: blocks.map((e) => ({ id: '', task: e.task })),
  };
}

/** Add a prerequisite edge and log it atomically, then return the fresh dependency view. */
export async function addDependency(
  workspaceId: string,
  taskId: string,
  dependsOnTaskId: string,
  actorId: string,
  activity: ActivityWrite,
): Promise<TaskDependencyRows> {
  const projectId = await projectOfTask(taskId);
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.taskDependency.create({ data: { workspaceId, taskId, dependsOnTaskId } });
    if (projectId) {
      await tx.taskActivity.create({
        data: {
          workspaceId,
          projectId,
          taskId,
          actorId,
          type: activity.type,
          message: activity.message,
        },
      });
    }
  });
  return getDependencies(taskId);
}

/** Remove a prerequisite edge (scoped to `taskId` + `workspaceId`) and log it atomically. */
export async function removeDependency(
  workspaceId: string,
  taskId: string,
  dependencyId: string,
  actorId: string,
  activity: ActivityWrite,
): Promise<TaskDependencyRows> {
  const projectId = await projectOfTask(taskId);
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.taskDependency.delete({ where: { id: dependencyId } });
    if (projectId) {
      await tx.taskActivity.create({
        data: {
          workspaceId,
          projectId,
          taskId,
          actorId,
          type: activity.type,
          message: activity.message,
        },
      });
    }
  });
  return getDependencies(taskId);
}

async function projectOfTask(taskId: string): Promise<string | null> {
  const row = await prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
  return row?.projectId ?? null;
}

/** Public name of a user, for composing an assignee-change activity message (never email). */
export async function getUserBrief(userId: string): Promise<{ id: string; name: string } | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true },
  });
  return row;
}

/** A task's title + status, workspace-scoped, for a dependency message + legality echo. */
export async function getTaskBrief(
  taskId: string,
  workspaceId: string,
): Promise<{ id: string; title: string } | null> {
  const row = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
    select: { id: true, title: true },
  });
  return row;
}

// ---- list (filters + keyset cursor) ----

export interface ListTasksParams {
  workspaceId: string;
  projectId: string;
  status: TaskStatus | undefined;
  priority: TaskPriority | undefined;
  assigneeId: string | undefined;
  unassigned: boolean;
  search: string | undefined;
  sort: TaskSortField;
  dir: 'asc' | 'desc';
  limit: number;
  cursor: string | undefined;
}

function encodeCursor(row: { [k: string]: unknown; id: string }, sort: TaskSortField): string {
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

export async function listTasks(
  params: ListTasksParams,
): Promise<{ rows: TaskRow[]; nextCursor: string | null }> {
  const {
    workspaceId,
    projectId,
    status,
    priority,
    assigneeId,
    unassigned,
    search,
    sort,
    dir,
    limit,
    cursor,
  } = params;

  const where: Prisma.TaskWhereInput = { workspaceId, projectId };
  const and: Prisma.TaskWhereInput[] = [];

  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (unassigned) where.assigneeId = null;
  else if (assigneeId) where.assigneeId = assigneeId;
  if (search) where.title = { contains: search, mode: 'insensitive' };

  const decoded = cursor ? decodeCursor(cursor) : null;
  if (decoded) {
    const isDate = DATE_SORTS.includes(sort);
    const cmpVal: string | Date = isDate && decoded.v ? new Date(decoded.v) : decoded.v;
    const gt: Prisma.TaskWhereInput = {
      OR: [{ [sort]: { gt: cmpVal } }, { AND: [{ [sort]: cmpVal }, { id: { gt: decoded.id } }] }],
    };
    const lt: Prisma.TaskWhereInput = {
      OR: [{ [sort]: { lt: cmpVal } }, { AND: [{ [sort]: cmpVal }, { id: { lt: decoded.id } }] }],
    };
    and.push(dir === 'asc' ? gt : lt);
  }
  if (and.length > 0) where.AND = and;

  const rows = await prisma.task.findMany({
    where,
    select: taskSelect,
    orderBy: [{ [sort]: dir }, { id: dir }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1] as unknown as RawTask | undefined;

  return {
    rows: page.map((r) => toTaskRow(r as unknown as RawTask)),
    nextCursor:
      hasMore && last
        ? encodeCursor(last as unknown as { [k: string]: unknown; id: string }, sort)
        : null,
  };
}

/**
 * Tasks assigned to `userId` across the workspace, narrowed to the projects they may SEE: a plain
 * MEMBER never sees a PRIVATE project they neither own nor created; OWNER/ADMIN see all. The project
 * visibility rule is expressed once here (mirrors `project.repo.listProjects`) so My Work cannot leak
 * private work.
 */
export async function listAssignedToMe(
  workspaceId: string,
  userId: string,
  callerRole: WorkspaceRole,
): Promise<MyTaskRow[]> {
  const projectWhere: Prisma.ProjectWhereInput = { workspaceId };
  if (callerRole === 'MEMBER') {
    projectWhere.AND = [
      {
        OR: [{ visibility: 'WORKSPACE' }, { ownerId: userId }, { createdById: userId }],
      },
    ];
  }

  const rows = await prisma.task.findMany({
    where: { workspaceId, assigneeId: userId, project: projectWhere },
    select: {
      ...taskSelect,
      project: { select: { id: true, name: true, projectKey: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    take: 200,
  });

  return rows.map((r) => {
    const row = r as unknown as RawTask & {
      project: { id: string; name: string; projectKey: string };
    };
    const { dependenciesIn, project, ...rest } = row;
    return { ...rest, blocked: dependenciesIn.length > 0, project };
  });
}

// ---- activity feed (time-ordered keyset cursor) ----

export async function listActivity(
  taskId: string,
  limit: number,
  cursor: string | undefined,
): Promise<{ rows: TaskActivityRow[]; nextCursor: string | null }> {
  const where: Prisma.TaskActivityWhereInput = { taskId };
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

  const rows = await prisma.taskActivity.findMany({
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

  return {
    rows: page.map((r) => ({
      id: r.id,
      type: r.type as TaskActivityType,
      message: r.message,
      createdAt: r.createdAt,
      actor: r.actor,
    })),
    nextCursor:
      hasMore && last
        ? Buffer.from(
            JSON.stringify({ v: last.createdAt.toISOString(), id: last.id }),
            'utf8',
          ).toString('base64url')
        : null,
  };
}
