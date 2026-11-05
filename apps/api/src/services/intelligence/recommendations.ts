import type {
  Blocker,
  DecisionRevisionImpact,
  Recommendation,
  RecommendationPriority,
  RiskSignal,
} from '@buildtogether/shared';
import type { DecisionSignal, TaskSignal } from '../../repositories/intelligence.repo.js';
import { APPROACHING_WINDOW_DAYS, day, destination, isDueSoon, isOpen } from './common.js';

/**
 * Next best actions (Phase 7 §E). Every recommendation is DERIVED from a concrete signal already
 * detected from real data — never generic productivity advice, never auto-executed. The orchestrator
 * passes the already-computed blockers/risks/impacts so a recommendation always points at an existing
 * entity and carries its reason + evidence + a navigation destination.
 */
export function buildRecommendations(
  workspaceId: string,
  projectId: string,
  tasks: TaskSignal[],
  decisions: DecisionSignal[],
  blockers: Blocker[],
  risks: RiskSignal[],
  impacts: DecisionRevisionImpact[],
  now: number,
  windowDays: number,
): Recommendation[] {
  const recs: Recommendation[] = [];
  const seen = new Set<string>();
  const titleOf = (taskId: string): string => tasks.find((t) => t.id === taskId)?.title ?? 'task';
  const push = (r: Recommendation): void => {
    if (seen.has(r.id)) return;
    seen.add(r.id);
    recs.push(r);
  };

  // Risks (HIGH/MEDIUM first) → review the task.
  for (const risk of risks) {
    if (risk.taskId === null) continue;
    const overdue = risk.signals.includes('OVERDUE');
    push({
      id: `rec:risk:${risk.id}`,
      action: overdue
        ? `Review the overdue task “${titleOf(risk.taskId)}”`
        : `Act on the ${risk.level.toLowerCase()}-risk task “${titleOf(risk.taskId)}”`,
      actionCode: overdue ? 'REVIEW_OVERDUE_TASK' : 'REVIEW_RISK',
      reason: risk.evidence,
      evidence: risk.what,
      priority: risk.level,
      entityKind: 'TASK',
      entityId: risk.taskId,
      projectId,
      destination: destination('TASK', workspaceId, projectId, risk.taskId),
    });
  }

  // Task blockers → resolve them (decision-review blockers are covered by the decision rule).
  for (const b of blockers) {
    if (b.source === 'DECISION_NEEDS_REVIEW' || b.taskId === null) continue;
    push({
      id: `rec:blocker:${b.id}`,
      action:
        b.source === 'AWAITING_DECISION'
          ? `Follow up on the decision blocking “${titleOf(b.taskId)}”`
          : `Resolve the blocker on “${titleOf(b.taskId)}”`,
      actionCode: b.source === 'AWAITING_DECISION' ? 'FOLLOW_UP_DECISION' : 'RESOLVE_BLOCKER',
      reason: b.evidence,
      evidence: b.description,
      priority: 'HIGH',
      entityKind: 'TASK',
      entityId: b.taskId,
      projectId,
      destination: b.destination,
    });
  }

  // Decisions awaiting review → approve or reject.
  for (const d of decisions.filter((x) => x.status === 'PROPOSED')) {
    push({
      id: `rec:decision:${d.id}`,
      action: `Review decision “${d.title}”`,
      actionCode: 'APPROVE_DECISION',
      reason: 'A proposed decision is unresolved, leaving dependent work without clarity.',
      evidence: d.title,
      priority: 'MEDIUM',
      entityKind: 'DECISION',
      entityId: d.id,
      projectId,
      destination: destination('DECISION', workspaceId, projectId, d.id),
    });
  }

  // Tasks affected by a revised decision → review (the owner decides; we never rewrite).
  for (const impact of impacts) {
    for (const task of impact.affectedTasks) {
      push({
        id: `rec:impact:${impact.decisionId}:${task.taskId}`,
        action: `Check task “${task.title}” after a decision change`,
        actionCode: 'REVIEW_AFFECTED_TASK',
        reason: task.reason,
        evidence: `Decision “${impact.decisionTitle}” was revised.`,
        priority: 'MEDIUM',
        entityKind: 'TASK',
        entityId: task.taskId,
        projectId,
        destination: destination('TASK', workspaceId, projectId, task.taskId),
      });
    }
  }

  // Unowned HIGH/URGENT open work → assign an owner.
  for (const t of tasks.filter(
    (x) => isOpen(x) && x.assignee === null && (x.priority === 'HIGH' || x.priority === 'URGENT'),
  )) {
    push({
      id: `rec:assign:${t.id}`,
      action: `Assign an owner to “${t.title}”`,
      actionCode: 'ASSIGN_UNOWNED_TASK',
      reason: `A ${t.priority.toLowerCase()}-priority task has no assignee.`,
      evidence: t.title,
      priority: t.priority === 'URGENT' ? 'HIGH' : 'MEDIUM',
      entityKind: 'TASK',
      entityId: t.id,
      projectId,
      destination: destination('TASK', workspaceId, projectId, t.id),
    });
  }

  // Approaching deadlines with no higher-priority action → confirm the plan.
  for (const t of tasks.filter((x) => isDueSoon(x, now, windowDays))) {
    push({
      id: `rec:deadline:${t.id}`,
      action: `Confirm “${t.title}” is on track for its deadline`,
      actionCode: 'UPDATE_APPROACHING_DEADLINE',
      reason: t.dueDate ? `Due ${day(t.dueDate)}.` : 'Due soon.',
      evidence: t.title,
      priority: 'MEDIUM' as RecommendationPriority,
      entityKind: 'TASK',
      entityId: t.id,
      projectId,
      destination: destination('TASK', workspaceId, projectId, t.id),
    });
  }

  const rank: Record<RecommendationPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return recs.sort((a, b) => rank[a.priority] - rank[b.priority]);
}

/** Personal next-actions for the caller's own tasks (no cross-user leakage — only their visible work). */
export function buildPersonalRecommendations(
  workspaceId: string,
  rows: {
    id: string;
    title: string;
    projectId: string;
    dueDate: string | null;
    blocked: boolean;
    status: string;
  }[],
  now: number,
): Recommendation[] {
  const recs: Recommendation[] = [];
  for (const r of rows) {
    if (r.status === 'DONE') continue;
    const due = r.dueDate ? Date.parse(r.dueDate) : null;
    if (due !== null && due < now) {
      recs.push(
        personalRec(
          workspaceId,
          r,
          `Review your overdue task “${r.title}”`,
          'REVIEW_OVERDUE_TASK',
          `Overdue since ${day(new Date(due))}.`,
          'HIGH',
        ),
      );
    } else if (r.blocked) {
      recs.push(
        personalRec(
          workspaceId,
          r,
          `Resolve the blocker on “${r.title}”`,
          'RESOLVE_BLOCKER',
          'An unfinished prerequisite is holding this task.',
          'HIGH',
        ),
      );
    } else if (due !== null && due <= now + APPROACHING_WINDOW_DAYS * 86_400_000) {
      recs.push(
        personalRec(
          workspaceId,
          r,
          `Confirm “${r.title}” is on track`,
          'UPDATE_APPROACHING_DEADLINE',
          `Due ${day(new Date(due))}.`,
          'MEDIUM',
        ),
      );
    }
  }
  const rank: Record<RecommendationPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return recs.sort((a, b) => rank[a.priority] - rank[b.priority]);
}

function personalRec(
  workspaceId: string,
  r: { id: string; title: string; projectId: string },
  action: string,
  actionCode: Recommendation['actionCode'],
  reason: string,
  priority: RecommendationPriority,
): Recommendation {
  return {
    id: `rec:me:${r.id}:${actionCode}`,
    action,
    actionCode,
    reason,
    evidence: r.title,
    priority,
    entityKind: 'TASK',
    entityId: r.id,
    projectId: r.projectId,
    destination: destination('TASK', workspaceId, r.projectId, r.id),
  };
}
