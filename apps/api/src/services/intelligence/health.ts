import type {
  FactorSeverity,
  HealthFactor,
  HealthFactorCode,
  ProjectHealth,
  ProjectMetrics,
} from '@buildtogether/shared';
import type { DecisionSignal, TaskSignal } from '../../repositories/intelligence.repo.js';
import { isOpen, isOverdue, isBlocked, isDueSoon, plural } from './common.js';

/**
 * Deterministic project health (Phase 7 §3A). `computeMetrics` produces raw counts over real tasks +
 * decisions; `computeHealth` turns those into one of three states by firing DOCUMENTED factor rules —
 * the worst severity wins, and every factor that fired travels with the verdict as the "why". AI never
 * invents health; it may only supplement these deterministic factors server-side.
 */

/** Raw, deterministic counts over a project's tasks + decisions. No scoring, no inference. */
export function computeMetrics(
  tasks: TaskSignal[],
  decisions: DecisionSignal[],
  now: number,
  windowDays: number,
): ProjectMetrics {
  const total = tasks.length;
  const open = tasks.filter(isOpen);
  const completed = total - open.length;
  const inProgress = tasks.filter(
    (t) => t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW',
  ).length;
  const todo = tasks.filter((t) => t.status === 'TODO').length;
  const overdue = open.filter((t) => isOverdue(t, now)).length;
  const blocked = open.filter(isBlocked).length;
  const dueSoon = open.filter((t) => isDueSoon(t, now, windowDays)).length;
  const nextDue = open
    .filter((t) => t.dueDate !== null && t.dueDate.getTime() >= now)
    .map((t) => t.dueDate as Date)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const awaitingReview = decisions.filter((d) => d.status === 'PROPOSED').length;

  return {
    totalTasks: total,
    completedTasks: completed,
    inProgressTasks: inProgress,
    todoTasks: todo,
    overdueTasks: overdue,
    blockedTasks: blocked,
    upcomingDeadlineTasks: dueSoon,
    nextDueDate: nextDue ? nextDue.toISOString() : null,
    decisionsAwaitingReview: awaitingReview,
    completionRatio: total === 0 ? 0 : completed / total,
  };
}

/** Inputs beyond metrics that escalate health: the already-computed HIGH risk count + impacted-task count. */
export interface HealthInputs {
  highRiskCount: number;
  impactedTaskCount: number;
  now: number;
}

const RANK: Record<FactorSeverity, number> = { RISK: 0, ATTENTION: 1, NONE: 2 };

/**
 * The explainable verdict. Each rule is documented inline; the state is the worst severity among the
 * factors that fired (RISK → AT_RISK, else ATTENTION → NEEDS_ATTENTION, else ON_TRACK).
 */
export function computeHealth(metrics: ProjectMetrics, inputs: HealthInputs): ProjectHealth {
  const factors: HealthFactor[] = [];
  const open = metrics.totalTasks - metrics.completedTasks;
  const overdueRatio = open > 0 ? metrics.overdueTasks / open : 0;

  if (metrics.totalTasks === 0) {
    factors.push(f('NO_TASKS', 'NONE', 'No tasks yet — nothing to track.', 0));
  } else if (metrics.completedTasks === metrics.totalTasks) {
    factors.push(f('ALL_COMPLETE', 'NONE', 'All tasks are complete.', metrics.completedTasks));
  }

  if (metrics.overdueTasks > 0) {
    const severe =
      metrics.overdueTasks >= OVERDUE_ESCALATE || overdueRatio >= OVERDUE_RATIO_ESCALATE;
    factors.push(
      f(
        'OVERDUE_TASKS',
        severe ? 'RISK' : 'ATTENTION',
        `${metrics.overdueTasks} overdue task${plural(metrics.overdueTasks)}.`,
        metrics.overdueTasks,
      ),
    );
  }
  if (metrics.blockedTasks > 0) {
    factors.push(
      f(
        'BLOCKED_TASKS',
        metrics.blockedTasks >= BLOCKED_ESCALATE ? 'RISK' : 'ATTENTION',
        `${metrics.blockedTasks} blocked task${plural(metrics.blockedTasks)}.`,
        metrics.blockedTasks,
      ),
    );
  }
  if (metrics.upcomingDeadlineTasks > 0) {
    factors.push(
      f(
        'APPROACHING_DEADLINES',
        'ATTENTION',
        `${metrics.upcomingDeadlineTasks} task${plural(metrics.upcomingDeadlineTasks)} due soon.`,
        metrics.upcomingDeadlineTasks,
      ),
    );
  }
  if (metrics.decisionsAwaitingReview > 0) {
    factors.push(
      f(
        'DECISIONS_AWAITING_REVIEW',
        'ATTENTION',
        `${metrics.decisionsAwaitingReview} decision${plural(metrics.decisionsAwaitingReview)} awaiting review.`,
        metrics.decisionsAwaitingReview,
      ),
    );
  }
  if (inputs.impactedTaskCount > 0) {
    factors.push(
      f(
        'AFFECTED_BY_DECISION_REVISION',
        'ATTENTION',
        `${inputs.impactedTaskCount} task${plural(inputs.impactedTaskCount)} affected by a revised decision.`,
        inputs.impactedTaskCount,
      ),
    );
  }
  if (inputs.highRiskCount > 0) {
    factors.push(
      f(
        'HIGH_RISK_ITEMS',
        'RISK',
        `${inputs.highRiskCount} high-risk item${plural(inputs.highRiskCount)}.`,
        inputs.highRiskCount,
      ),
    );
  }

  const state = factors.some((x) => x.severity === 'RISK')
    ? 'AT_RISK'
    : factors.some((x) => x.severity === 'ATTENTION')
      ? 'NEEDS_ATTENTION'
      : 'ON_TRACK';

  factors.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  return { state, factors, metrics, computedAt: new Date(inputs.now).toISOString() };
}

// Escalation thresholds (mirrored from common.ts constants; kept local so the rule reads in one place).
const OVERDUE_ESCALATE = 3;
const BLOCKED_ESCALATE = 3;
const OVERDUE_RATIO_ESCALATE = 0.5;

const f = (
  code: HealthFactorCode,
  severity: FactorSeverity,
  label: string,
  count: number,
): HealthFactor => ({ code, severity, label, count, evidenceEntityIds: [] });
