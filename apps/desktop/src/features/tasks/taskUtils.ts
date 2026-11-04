import type { TaskActivityType, TaskPriority, TaskStatus } from '@buildtogether/shared';
import type { BadgeTone } from '../../components/ui/Badge';

/**
 * Presentation helpers for the tasks feature. Pure, dependency-free and locale-stable so a task row,
 * a kanban card and the detail panel always render the same status/priority/date/blocked marker.
 * These are VISUAL only — they carry NO authorization meaning (the server decides who may act).
 *
 * Monochrome discipline (brief §5): the only hues are the restrained status tints already defined for
 * projects. Priority ramps from neutral → warning → danger; workflow status stays neutral/one accent so
 * a board reads calm. `blocked` is surfaced as a distinct warning marker, never a color-coded status.
 */

const STATUS_TONES: Record<TaskStatus, BadgeTone> = {
  TODO: 'neutral',
  IN_PROGRESS: 'info',
  IN_REVIEW: 'warning',
  DONE: 'success',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  DONE: 'Done',
};

export function taskStatusTone(status: TaskStatus): BadgeTone {
  return STATUS_TONES[status];
}

export function taskStatusLabel(status: TaskStatus): string {
  return STATUS_LABELS[status];
}

const PRIORITY_TONES: Record<TaskPriority, BadgeTone> = {
  LOW: 'neutral',
  MEDIUM: 'neutral',
  HIGH: 'warning',
  URGENT: 'danger',
};

export function taskPriorityTone(priority: TaskPriority): BadgeTone {
  return PRIORITY_TONES[priority];
}

/** Title-case a priority (URGENT → Urgent) — the label is the enum itself, just human-cased. */
export function taskPriorityLabel(priority: TaskPriority): string {
  return priority.charAt(0) + priority.slice(1).toLowerCase();
}

/** The kanban column order. Exported so the board and any count summary iterate the same sequence. */
export const TASK_BOARD_COLUMNS: readonly TaskStatus[] = [
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
];

const ACTIVITY_LABELS: Record<TaskActivityType, string> = {
  CREATED: 'Created',
  UPDATED: 'Updated',
  ASSIGNEE_CHANGED: 'Assignee',
  STATUS_CHANGED: 'Status',
  PRIORITY_CHANGED: 'Priority',
  DUE_DATE_CHANGED: 'Due date',
  DEPENDENCY_ADDED: 'Dependency',
  DEPENDENCY_REMOVED: 'Dependency',
  COMPLETED: 'Completed',
};

/** A short tag for a timeline entry type (the message carries the full sentence). */
export function taskActivityLabel(type: TaskActivityType): string {
  return ACTIVITY_LABELS[type];
}

/** A stable, readable absolute date (`Mar 4, 2026`). Null / invalid → an em dash. */
export function formatTaskDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Whether a task is past its due date. A task with no due date is never overdue; a DONE task is never
 * overdue (it is finished). Comparison is by calendar day, not the instant, so "due today" is not yet
 * overdue. Pure + clock-argument so tests can pin "now".
 */
export function isOverdue(
  dueDate: string | null,
  status: TaskStatus,
  now: Date = new Date(),
): boolean {
  if (!dueDate || status === 'DONE') return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const nowDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return dueDay < nowDay;
}

/** Compact due-date cell: absolute date, or "Overdue" prefix when past due and not done. */
export function taskDueLabel(
  dueDate: string | null,
  status: TaskStatus,
  now: Date = new Date(),
): { text: string; overdue: boolean } {
  const text = formatTaskDate(dueDate);
  return { text, overdue: isOverdue(dueDate, status, now) };
}
