/**
 * Phase 5 task contracts (the execution layer inside a project).
 *
 * Single source of truth compiled by BOTH `@buildtogether/api` (request/response shapes) and the
 * `@buildtogether/desktop` renderer + main IPC surface, so the API envelope, the bridge and the UI
 * can never drift (mirrors `domain.ts` / `chat.ts` / `projects.ts`). Types + const tables only — no
 * runtime logic.
 *
 * SECURITY: these are read/write DTOs only. Authorization is decided server-side (workspace
 * membership + role + project visibility/ownership) on every request. A client sending a
 * `workspaceId`, `projectId`, `assigneeId` or `dependsOnTaskId` never gains access or a cross-scope
 * write — the server re-derives membership, project boundary and dependency legality from the DB.
 */

import type { ApiResponse } from './index.js';

// ---- Enums (mirror the Prisma enums; string unions for the wire) ----

/**
 * Task workflow lifecycle. A closed, extensible state machine kept SEPARATE from dependency/blocked
 * state: completing a prerequisite never auto-moves a dependent task (brief §7). `blocked` on a
 * `TaskView` is DERIVED (an unfinished prerequisite exists), never a stored status.
 */
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';

/** Task urgency, independent of workflow status. */
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

/** The important events recorded on a task's timeline. A small closed vocabulary, not an audit platform. */
export type TaskActivityType =
  | 'CREATED'
  | 'UPDATED'
  | 'ASSIGNEE_CHANGED'
  | 'STATUS_CHANGED'
  | 'PRIORITY_CHANGED'
  | 'DUE_DATE_CHANGED'
  | 'DEPENDENCY_ADDED'
  | 'DEPENDENCY_REMOVED'
  | 'COMPLETED';

export const TASK_STATUSES: readonly TaskStatus[] = [
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
] as const;
export const TASK_PRIORITIES: readonly TaskPriority[] = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT',
] as const;
export const TASK_ACTIVITY_TYPES: readonly TaskActivityType[] = [
  'CREATED',
  'UPDATED',
  'ASSIGNEE_CHANGED',
  'STATUS_CHANGED',
  'PRIORITY_CHANGED',
  'DUE_DATE_CHANGED',
  'DEPENDENCY_ADDED',
  'DEPENDENCY_REMOVED',
  'COMPLETED',
] as const;

// ---- Read models ----

/** The assignee as shown on a row / detail (avatar-safe subset of a user). Null assignee = unassigned. */
export interface TaskAssigneeView {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** A lightweight actor reference (creator / activity actor) — name only, no email. */
export interface TaskActorView {
  id: string;
  name: string;
}

/**
 * A task as returned to an authorized caller. Dates are ISO strings (or null). `blocked` is computed
 * server-side: true when at least one prerequisite (`dependsOn`) is not yet DONE. It carries no
 * workflow meaning of its own — a blocked task can still be edited/moved by an authorized user.
 */
export interface TaskView {
  id: string;
  workspaceId: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  createdBy: TaskActorView;
  assignee: TaskAssigneeView | null;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  blocked: boolean;
}

/** A light pointer to a related task (a dependency), enough to render + navigate to it. */
export interface TaskRef {
  id: string;
  title: string;
  status: TaskStatus;
}

/**
 * One prerequisite edge incident to the queried task. `id` is the TaskDependency row id — the handle
 * needed to DELETE this specific edge. `task` is the OTHER end (the prerequisite this task waits on).
 */
export interface TaskDependencyView {
  id: string;
  task: TaskRef;
}

/**
 * The dependency edges incident to one task, resolved from the caller's view of the task.
 * `dependsOn` = prerequisites this task waits for (each carries a deletable edge id).
 * `blocks`    = dependent tasks that wait for this one (read-only pointers).
 */
export interface TaskDependencies {
  taskId: string;
  dependsOn: TaskDependencyView[];
  blocks: TaskRef[];
}

/** One timeline entry. `message` is pre-rendered server-side (closed vocabulary, locale-stable). */
export interface TaskActivityView {
  id: string;
  type: TaskActivityType;
  actor: TaskActorView;
  message: string;
  createdAt: string;
}

/**
 * A task in the cross-project "My Work" aggregate — a `TaskView` plus the project it belongs to so the
 * list can show context and navigate to it. Returned only for tasks the caller can see in the active
 * workspace (project visibility applied server-side).
 */
export interface MyTaskView extends TaskView {
  project: { id: string; name: string; projectKey: string };
}

// ---- List query (search / filter / sort / pagination) ----

export type TaskSortField = 'createdAt' | 'updatedAt' | 'dueDate' | 'title' | 'priority' | 'status';

/** Closed sort vocabulary — mirrored by the main-process query builder and the API validation schema. */
export const TASK_SORT_FIELDS: readonly TaskSortField[] = [
  'createdAt',
  'updatedAt',
  'dueDate',
  'title',
  'priority',
  'status',
] as const;

export interface TaskListQuery {
  status?: TaskStatus;
  priority?: TaskPriority;
  /** Filter to a single assignee (their userId). Mutually exclusive with `unassigned`. */
  assigneeId?: string;
  /** When true, restrict to tasks with no assignee. */
  unassigned?: boolean;
  /** Substring match against task title (case-insensitive). */
  search?: string;
  sort?: TaskSortField;
  dir?: 'asc' | 'desc';
  limit?: number;
  /** Opaque forward cursor (base64 of the last seen sort key + id). */
  cursor?: string;
}

// ---- Write inputs (validated server-side; mirrored here for typed clients) ----

/**
 * Create a task. Only `title` is required; everything else is optional and defaulted server-side
 * (status TODO, priority MEDIUM). `dependencyIds` are prerequisites applied atomically on create and
 * validated (same project, no self/cycle) exactly like the standalone dependency endpoint.
 */
export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  dependencyIds?: string[];
}

/** Partial content update. Status + assignee have their own focused endpoints so activity is typed
 *  correctly, but a general PATCH may also carry them (the service reconciles both). */
export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  startDate?: string | null;
  dueDate?: string | null;
}

/** Set or clear the assignee. The server validates the target is a current workspace member. */
export interface AssignTaskInput {
  assigneeId: string | null;
}

/** Move a task on the workflow board. Setting DONE stamps `completedAt`; leaving DONE clears it. */
export interface ChangeTaskStatusInput {
  status: TaskStatus;
}

/** Add a prerequisite: this task will depend on `dependsOnTaskId` (same project, no cycle). */
export interface AddTaskDependencyInput {
  dependsOnTaskId: string;
}

// ---- API endpoint aliases (self-documenting response types) ----

export type TaskListResponse = ApiResponse<TaskView[]>;
export type TaskResponse = ApiResponse<TaskView>;
export type TaskDependenciesResponse = ApiResponse<TaskDependencies>;
export type TaskActivityListResponse = ApiResponse<TaskActivityView[]>;
export type MyTaskListResponse = ApiResponse<MyTaskView[]>;
