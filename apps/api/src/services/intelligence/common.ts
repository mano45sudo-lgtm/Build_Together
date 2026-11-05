import type {
  IntelligenceDestination,
  IntelligenceEntityKind,
  IntelligencePerson,
} from '@buildtogether/shared';
import type {
  DecisionSignal,
  PrerequisiteSignal,
  TaskSignal,
} from '../../repositories/intelligence.repo.js';

/**
 * Shared primitives for the deterministic execution-intelligence engine (Phase 7). Every detector in
 * this folder is a TOTAL, pure function over already-authorized signal rows: no Prisma, no Express, no
 * clock passed implicitly. All thresholds live HERE, once, so health/blockers/risk/recommendations are
 * consistent and documented — the brief forbids arbitrary scores (Phase 7 §3A/§D).
 */

/** Open tasks due within this many days count as "approaching deadlines" (tunable per request). */
export const APPROACHING_WINDOW_DAYS = 7;
/** An open task created longer than this ago is "long-running". */
export const LONG_RUNNING_DAYS = 14;
/** An overdue task past this many days — or one of HIGH/URGENT priority — escalates a risk to HIGH. */
export const SEVERE_OVERDUE_DAYS = 7;
/** More due-date edits than this on one task is a deadline-slip signal. */
export const REPEATED_SLIP_THRESHOLD = 3;
/** At/above this many overdue (or blocked) tasks, the project escalates toward AT_RISK. */
export const OVERDUE_AT_RISK_COUNT = 3;
export const BLOCKED_AT_RISK_COUNT = 3;
/** Overdue open tasks as a fraction of all open tasks at/above which the project is AT_RISK. */
export const OVERDUE_AT_RISK_RATIO = 0.5;

export const DAY_MS = 86_400_000;

/** Decisions not yet approved are "pending" for a task waiting on a decision. */
const AWAITING_DECISION_STATUSES = new Set(['DRAFT', 'PROPOSED']);

export const isOpen = (t: TaskSignal): boolean => t.status !== 'DONE';

export const isOverdue = (t: TaskSignal, now: number): boolean =>
  isOpen(t) && t.dueDate !== null && t.dueDate.getTime() < now;

/** Reuses the derived unfinished-prerequisite relationship (mirrors the task layer's `blocked`). */
export const isBlocked = (t: TaskSignal): boolean => isOpen(t) && t.prerequisites.length > 0;

export const daysLate = (t: TaskSignal, now: number): number =>
  t.dueDate ? Math.floor((now - t.dueDate.getTime()) / DAY_MS) : 0;

export function isDueSoon(t: TaskSignal, now: number, windowDays: number): boolean {
  if (!isOpen(t) || !t.dueDate) return false;
  const due = t.dueDate.getTime();
  return due >= now && due <= now + windowDays * DAY_MS;
}

export function isLongRunning(t: TaskSignal, now: number): boolean {
  return isOpen(t) && now - t.createdAt.getTime() > LONG_RUNNING_DAYS * DAY_MS;
}

/** Unapproved decisions (DRAFT/PROPOSED) that touch `taskId` — a task waiting on a decision. */
export function decisionsPendingFor(taskId: string, decisions: DecisionSignal[]): DecisionSignal[] {
  return decisions.filter(
    (d) => AWAITING_DECISION_STATUSES.has(d.status) && d.linkedTaskIds.includes(taskId),
  );
}

/** The first overdue unfinished prerequisite of a task, else the first unfinished one. */
export function drivingPrerequisite(t: TaskSignal, now: number): PrerequisiteSignal | undefined {
  const overdue = t.prerequisites.find((p) => p.dueDate && p.dueDate.getTime() < now);
  return overdue ?? t.prerequisites[0];
}

export const person = (p: { id: string; name: string } | null): IntelligencePerson | null =>
  p ? { id: p.id, name: p.name } : null;

export function destination(
  kind: IntelligenceEntityKind,
  workspaceId: string,
  projectId: string | null,
  entityId: string,
): IntelligenceDestination {
  return { kind, workspaceId, projectId, entityId };
}

/** English plural helper for the human sentences the engine renders. */
export const plural = (n: number): string => (n === 1 ? '' : 's');

/** ISO date (YYYY-MM-DD) from a Date or epoch, for evidence strings. */
export const day = (value: Date | number): string => new Date(value).toISOString().slice(0, 10);
