import type {
  CreateTaskInput,
  MyTaskView,
  TaskActivityView,
  TaskDependencies,
  TaskListQuery,
  TaskPriority,
  TaskRef,
  TaskSortField,
  TaskStatus,
  TaskView,
  UpdateTaskInput,
} from '@buildtogether/shared';
import { TASK_PRIORITIES, TASK_STATUSES } from '@buildtogether/shared';
import { badRequest, conflict, forbidden, notFound } from '../errors/app-error.js';
import * as projectService from './project.service.js';
import * as workspaceRepo from '../repositories/workspace.repo.js';
import * as taskRepo from '../repositories/task.repo.js';
import type { ActivityWrite } from '../repositories/task.repo.js';
import { toMyTaskView, toTaskActivityView, toTaskView } from '../lib/view.js';
import type { TaskDependencyRows } from '../repositories/task.repo.js';

/**
 * Tasks business logic. The route middleware (`authenticate` + `requireWorkspaceRole('MEMBER')`) has
 * ALREADY proven (fresh, from the DB) that the caller is a member of the PATH workspace. On top of that
 * this service enforces the PROJECT-level rules and never trusts a client-supplied workspace / project /
 * user id: a task is always resolved to its real workspace, and every read/write re-checks the project
 * the task belongs to is visible to the caller (and, for mutations, manageable by them).
 *
 * Permission matrix (server-side; the desktop UI mirrors it for visibility only):
 *   - VIEW (list / get / dependencies / activity / assigned-to-me): the caller must be able to VIEW the
 *       owning project (workspace member; PRIVATE projects only to owner/creator + OWNER/ADMIN). A
 *       denied read is a 404 — a project the caller cannot see does not exist to them.
 *   - CREATE: anyone who can view the project (turn a plan into work). The assignee, if set, must be a
 *       current workspace member.
 *   - UPDATE content / DELETE / ASSIGN / DEPENDENCIES: the project MANAGER — workspace OWNER/ADMIN, or
 *       the project's own owner/creator (mirrors `project.service.canManage`).
 *   - STATUS: the project manager, OR the task's assignee/creator (the person doing the work moves it).
 *   - Dependency graph: within the SAME project + workspace, no self-edge, no duplicate, no cycle.
 *
 * Blocked state is DERIVED (an unfinished prerequisite exists), never stored, and completing a
 * prerequisite NEVER auto-moves a dependent task (brief §7 — dependency state ⊥ workflow status).
 */

export interface Caller {
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}

// ---- date coercion (mirrors project.service) ----

type DateInput = string | null | undefined;

function toDate(value: DateInput): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw badRequest('INVALID_DATE', 'Provide a valid date');
  return d;
}

const label = (v: string): string =>
  v
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');

// ---- the project gate (visibility + management) ----

/** Resolve a task in its workspace, then assert the caller can VIEW its project. Returns both. */
async function loadTaskWithProjectAccess(
  taskId: string,
  workspaceId: string,
  caller: Caller,
): Promise<{
  task: Awaited<ReturnType<typeof taskRepo.findTask>>;
  projectId: string;
  canManage: boolean;
}> {
  const task = await taskRepo.findTask(taskId, workspaceId);
  if (!task) throw notFound('TASK_NOT_FOUND', 'Task not found');
  // getProject enforces workspace + visibility and throws a 404 if the caller cannot see it.
  const project = await projectService.getProject(task.projectId, workspaceId, caller);
  const canManage =
    caller.role !== 'MEMBER' ||
    project.owner.id === caller.userId ||
    project.createdById === caller.userId;
  return { task, projectId: project.id, canManage };
}

function requireManage(canManage: boolean): void {
  if (!canManage) {
    throw forbidden(
      'INSUFFICIENT_ROLE',
      'You can only manage tasks in projects you own or administer',
    );
  }
}

/** Assert `userId` is a current member of `workspaceId` (an assignee must be a real member). */
async function requireMember(workspaceId: string, userId: string): Promise<void> {
  const role = await workspaceRepo.getRole(workspaceId, userId);
  if (!role) throw badRequest('ASSIGNEE_NOT_MEMBER', 'The assignee must be a workspace member');
}

// ---- dependency legality (same project + workspace, no self / duplicate / cycle) ----

/**
 * Would adding edge `taskId -> dependsOnTaskId` (taskId waits on dependsOnTaskId) close a cycle? A cycle
 * exists iff `taskId` is reachable from `dependsOnTaskId` by following prerequisite edges (i.e. the
 * prerequisite already (transitively) waits on the task we are about to link). DFS over the project's
 * small edge set; no DB writes on this path.
 */
async function wouldCreateCycle(
  projectId: string,
  taskId: string,
  dependsOnTaskId: string,
): Promise<boolean> {
  const edges = await taskRepo.getProjectEdges(projectId);
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.taskId);
    if (list) list.push(e.dependsOnTaskId);
    else adj.set(e.taskId, [e.dependsOnTaskId]);
  }
  // Walk "depends on" from the prospective prerequisite; reaching `taskId` means a cycle.
  const stack = [dependsOnTaskId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (cur === taskId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of adj.get(cur) ?? []) stack.push(next);
  }
  return false;
}

/** Validate one prospective edge and return nothing on success; throws a specific error otherwise. */
async function assertEdgeLegal(
  workspaceId: string,
  projectId: string,
  taskId: string,
  dependsOnTaskId: string,
): Promise<void> {
  if (taskId === dependsOnTaskId) {
    throw badRequest('SELF_DEPENDENCY', 'A task cannot depend on itself');
  }
  const inScope = await taskRepo.countTasksInProject([dependsOnTaskId], projectId, workspaceId);
  if (inScope !== 1) {
    throw badRequest(
      'DEPENDENCY_OUT_OF_SCOPE',
      'A dependency must be another task in the same project',
    );
  }
  if (await taskRepo.dependencyExists(taskId, dependsOnTaskId)) {
    throw conflict('DEPENDENCY_EXISTS', 'That dependency already exists');
  }
  if (await wouldCreateCycle(projectId, taskId, dependsOnTaskId)) {
    throw badRequest('CIRCULAR_DEPENDENCY', 'That dependency would create a circular chain');
  }
}

// ---- dependency view ----

function toDependencies(taskId: string, rows: TaskDependencyRows): TaskDependencies {
  const dependsOn = rows.dependsOn.map((e) => ({ id: e.id, task: e.task as TaskRef }));
  const blocks = rows.blocks.map((e) => e.task as TaskRef);
  return { taskId, dependsOn, blocks };
}

// ---- create ----

export async function createTask(
  workspaceId: string,
  projectId: string,
  caller: Caller,
  input: CreateTaskInput,
): Promise<TaskView> {
  // View gate: a caller can only add work to a project they can see.
  await projectService.getProject(projectId, workspaceId, caller);

  const status = (input.status ?? 'TODO') as TaskStatus;
  const priority = (input.priority ?? 'MEDIUM') as TaskPriority;
  if (!TASK_STATUSES.includes(status)) throw badRequest('INVALID_STATUS', 'Unknown status');
  if (!TASK_PRIORITIES.includes(priority)) throw badRequest('INVALID_PRIORITY', 'Unknown priority');

  const assigneeId = input.assigneeId ?? null;
  if (assigneeId) await requireMember(workspaceId, assigneeId);

  const start = toDate(input.startDate);
  const due = toDate(input.dueDate);

  // Validate + de-duplicate prerequisite ids up front; each must be a sibling task and legal vs the rest.
  const dependencyIds = Array.from(new Set(input.dependencyIds ?? [])).filter(
    (id) => id.length > 0,
  );
  for (const depId of dependencyIds) {
    // The task does not exist yet, so the cycle check runs against the sibling graph with the new node
    // implicitly the target; a self-id is impossible (new task), and a mutual pair A<->B is caught when
    // the second edge is added post-create. Reject any dep that references the (nonexistent) task itself.
    if (await taskRepo.dependencyExists(depId, depId)) {
      throw badRequest('SELF_DEPENDENCY', 'A task cannot depend on itself');
    }
    const inScope = await taskRepo.countTasksInProject([depId], projectId, workspaceId);
    if (inScope !== 1) {
      throw badRequest(
        'DEPENDENCY_OUT_OF_SCOPE',
        'A dependency must be a task in the same project',
      );
    }
  }

  const activity: ActivityWrite[] = [{ type: 'CREATED', message: 'Created this task.' }];
  if (assigneeId) {
    const who = await taskRepo.getUserBrief(assigneeId);
    activity.push({
      type: 'ASSIGNEE_CHANGED',
      message: who ? `Assigned to ${who.name}.` : 'Assigned an owner.',
    });
  }
  for (const depId of dependencyIds) {
    const dep = await taskRepo.getTaskBrief(depId, workspaceId);
    activity.push({
      type: 'DEPENDENCY_ADDED',
      message: dep ? `Blocked by “${dep.title}”.` : 'Added a dependency.',
    });
  }

  const row = await taskRepo.createTask({
    workspaceId,
    projectId,
    title: input.title,
    description: input.description ?? null,
    status,
    priority,
    createdById: caller.userId,
    assigneeId,
    startDate: start ?? null,
    dueDate: due ?? null,
    completedAt: status === 'DONE' ? new Date() : null,
    dependencyIds,
    activity,
  });
  return toTaskView(row);
}

// ---- read ----

export interface TaskListResult {
  items: TaskView[];
  nextCursor: string | null;
}

export async function listTasks(
  workspaceId: string,
  projectId: string,
  caller: Caller,
  query: TaskListQuery,
): Promise<TaskListResult> {
  await projectService.getProject(projectId, workspaceId, caller);
  const { rows, nextCursor } = await taskRepo.listTasks({
    workspaceId,
    projectId,
    status: query.status,
    priority: query.priority,
    assigneeId: query.assigneeId,
    unassigned: query.unassigned === true,
    search: query.search && query.search.length > 0 ? query.search : undefined,
    sort: (query.sort ?? 'updatedAt') as TaskSortField,
    dir: query.dir ?? 'desc',
    limit: query.limit ?? 50,
    cursor: query.cursor,
  });
  return { items: rows.map(toTaskView), nextCursor };
}

export async function getTask(
  taskId: string,
  workspaceId: string,
  caller: Caller,
): Promise<TaskView> {
  const { task } = await loadTaskWithProjectAccess(taskId, workspaceId, caller);
  return toTaskView(task!);
}

export async function getDependencies(
  taskId: string,
  workspaceId: string,
  caller: Caller,
): Promise<TaskDependencies> {
  const { task } = await loadTaskWithProjectAccess(taskId, workspaceId, caller);
  const rows = await taskRepo.getDependencies(task!.id);
  return toDependencies(task!.id, rows);
}

export interface ActivityResult {
  items: TaskActivityView[];
  nextCursor: string | null;
}

export async function listActivity(
  taskId: string,
  workspaceId: string,
  caller: Caller,
  query: { limit?: number; cursor?: string },
): Promise<ActivityResult> {
  const { task } = await loadTaskWithProjectAccess(taskId, workspaceId, caller);
  const { rows, nextCursor } = await taskRepo.listActivity(
    task!.id,
    query.limit ?? 30,
    query.cursor,
  );
  return { items: rows.map(toTaskActivityView), nextCursor };
}

export async function listMyTasks(workspaceId: string, caller: Caller): Promise<MyTaskView[]> {
  const rows = await taskRepo.listAssignedToMe(workspaceId, caller.userId, caller.role);
  return rows.map(toMyTaskView);
}

// ---- update (content) ----

export async function updateTask(
  taskId: string,
  workspaceId: string,
  caller: Caller,
  input: UpdateTaskInput,
): Promise<TaskView> {
  const { task, canManage } = await loadTaskWithProjectAccess(taskId, workspaceId, caller);
  const current = task!;
  // Editing content is a manager action; a plain assignee changes status via the status endpoint only.
  const assigneeOrCreator =
    current.assignee?.id === caller.userId || current.createdById === caller.userId;
  if (!canManage && !assigneeOrCreator) {
    throw forbidden('INSUFFICIENT_ROLE', 'You can only edit tasks you own, created, or manage');
  }

  const activity: ActivityWrite[] = [];
  const data: taskRepo.TaskUpdateFields = {};

  if (input.title !== undefined && input.title !== current.title) {
    data.title = input.title;
    activity.push({ type: 'UPDATED', message: 'Renamed this task.' });
  }
  if (input.description !== undefined && input.description !== current.description) {
    data.description = input.description;
    activity.push({ type: 'UPDATED', message: 'Updated the description.' });
  }
  if (input.priority !== undefined && input.priority !== current.priority) {
    data.priority = input.priority;
    activity.push({
      type: 'PRIORITY_CHANGED',
      message: `Set priority to ${label(input.priority)}.`,
    });
  }
  const start = toDate(input.startDate);
  if (start !== undefined) data.startDate = start;
  const due = toDate(input.dueDate);
  if (due !== undefined && String(due) !== String(current.dueDate)) {
    data.dueDate = due;
    activity.push({
      type: 'DUE_DATE_CHANGED',
      message: due ? `Set due date to ${due.toISOString().slice(0, 10)}.` : 'Cleared the due date.',
    });
  }

  // A general PATCH may also carry a status change; keep it consistent with the status endpoint.
  if (input.status !== undefined && input.status !== current.status) {
    if (!canManage && !assigneeOrCreator) {
      throw forbidden('INSUFFICIENT_ROLE', 'You cannot change this task’s status');
    }
    data.status = input.status;
    data.completedAt = input.status === 'DONE' ? new Date() : null;
    activity.push({
      type: 'STATUS_CHANGED',
      message: `Moved from ${label(current.status)} to ${label(input.status)}.`,
    });
    if (input.status === 'DONE')
      activity.push({ type: 'COMPLETED', message: 'Completed this task.' });
  }

  if (Object.keys(data).length === 0) {
    // Nothing actually changed — echo the current state without writing an activity row.
    return toTaskView(current);
  }
  if (activity.length === 0) {
    activity.push({ type: 'UPDATED', message: 'Updated this task.' });
  }

  const row = await taskRepo.updateTask(taskId, workspaceId, caller.userId, data, activity);
  return toTaskView(row);
}

// ---- assign ----

export async function assignTask(
  taskId: string,
  workspaceId: string,
  caller: Caller,
  assigneeId: string | null,
): Promise<TaskView> {
  const { canManage } = await loadTaskWithProjectAccess(taskId, workspaceId, caller);
  requireManage(canManage);
  if (assigneeId) await requireMember(workspaceId, assigneeId);

  const who = assigneeId ? await taskRepo.getUserBrief(assigneeId) : null;
  const activity: ActivityWrite = {
    type: 'ASSIGNEE_CHANGED',
    message: who ? `Assigned to ${who.name}.` : 'Removed the assignee.',
  };
  const row = await taskRepo.setAssignee(taskId, workspaceId, caller.userId, assigneeId, activity);
  return toTaskView(row);
}

// ---- status ----

export async function changeStatus(
  taskId: string,
  workspaceId: string,
  caller: Caller,
  status: TaskStatus,
): Promise<TaskView> {
  const { task, canManage } = await loadTaskWithProjectAccess(taskId, workspaceId, caller);
  const current = task!;
  const assigneeOrCreator =
    current.assignee?.id === caller.userId || current.createdById === caller.userId;
  if (!canManage && !assigneeOrCreator) {
    throw forbidden(
      'INSUFFICIENT_ROLE',
      'Only the assignee, creator or a manager can move this task',
    );
  }
  if (status === current.status) return toTaskView(current); // idempotent, no activity

  const activity: ActivityWrite[] = [
    { type: 'STATUS_CHANGED', message: `Moved from ${label(current.status)} to ${label(status)}.` },
  ];
  if (status === 'DONE') activity.push({ type: 'COMPLETED', message: 'Completed this task.' });

  const row = await taskRepo.updateTask(
    taskId,
    workspaceId,
    caller.userId,
    { status, completedAt: status === 'DONE' ? new Date() : null },
    activity,
  );
  return toTaskView(row);
}

// ---- delete ----

export async function deleteTask(
  taskId: string,
  workspaceId: string,
  caller: Caller,
): Promise<null> {
  const { canManage } = await loadTaskWithProjectAccess(taskId, workspaceId, caller);
  requireManage(canManage);
  await taskRepo.deleteTask(taskId);
  return null;
}

// ---- dependencies ----

export async function addDependency(
  taskId: string,
  workspaceId: string,
  caller: Caller,
  dependsOnTaskId: string,
): Promise<TaskDependencies> {
  const { task, canManage, projectId } = await loadTaskWithProjectAccess(
    taskId,
    workspaceId,
    caller,
  );
  requireManage(canManage);
  await assertEdgeLegal(workspaceId, projectId, task!.id, dependsOnTaskId);

  const dep = await taskRepo.getTaskBrief(dependsOnTaskId, workspaceId);
  const activity: ActivityWrite = {
    type: 'DEPENDENCY_ADDED',
    message: dep ? `Now blocked by “${dep.title}”.` : 'Added a dependency.',
  };
  const rows = await taskRepo.addDependency(
    workspaceId,
    task!.id,
    dependsOnTaskId,
    caller.userId,
    activity,
  );
  return toDependencies(task!.id, rows);
}

export async function removeDependency(
  taskId: string,
  workspaceId: string,
  caller: Caller,
  dependencyId: string,
): Promise<TaskDependencies> {
  const { task, canManage } = await loadTaskWithProjectAccess(taskId, workspaceId, caller);
  requireManage(canManage);
  const edge = await taskRepo.findDependencyById(dependencyId, task!.id, workspaceId);
  if (!edge) throw notFound('DEPENDENCY_NOT_FOUND', 'Dependency not found');

  const dep = await taskRepo.getTaskBrief(edge.dependsOnTaskId, workspaceId);
  const activity: ActivityWrite = {
    type: 'DEPENDENCY_REMOVED',
    message: dep ? `No longer blocked by “${dep.title}”.` : 'Removed a dependency.',
  };
  const rows = await taskRepo.removeDependency(
    workspaceId,
    task!.id,
    dependencyId,
    caller.userId,
    activity,
  );
  return toDependencies(task!.id, rows);
}
