import type { RiskLevel, RiskSignal, RiskSignalCode } from '@buildtogether/shared';
import type { DecisionSignal, TaskSignal } from '../../repositories/intelligence.repo.js';
import {
  DAY_MS,
  REPEATED_SLIP_THRESHOLD,
  SEVERE_OVERDUE_DAYS,
  day,
  daysLate,
  decisionsPendingFor,
  destination,
  isBlocked,
  isDueSoon,
  isLongRunning,
  isOpen,
  isOverdue,
} from './common.js';

/**
 * Deterministic risk & deadline intelligence (Phase 7 §D). Each open task is tagged with the real
 * signals it exhibits; a documented severity rule turns those into LOW/MEDIUM/HIGH. This never
 * predicts the future with certainty — every risk lists WHAT, WHY (the fired signals), the EVIDENCE,
 * and the ACTION that could resolve it. AI may supplement these rules later, never replace them.
 */
export function detectRisks(
  workspaceId: string,
  projectId: string,
  tasks: TaskSignal[],
  decisions: DecisionSignal[],
  projectTargetDate: Date | null,
  now: number,
  windowDays: number,
): RiskSignal[] {
  const risks: RiskSignal[] = [];

  for (const t of tasks.filter(isOpen)) {
    const overdue = isOverdue(t, now);
    const blocked = isBlocked(t);
    const dueSoon = isDueSoon(t, now, windowDays);
    const awaiting = decisionsPendingFor(t.id, decisions).length > 0;

    const signals: RiskSignalCode[] = [];
    if (overdue) signals.push('OVERDUE');
    if (dueSoon) signals.push('DUE_SOON');
    if (isLongRunning(t, now)) signals.push('LONG_RUNNING');
    if (blocked) signals.push('BLOCKED');
    if (awaiting) signals.push('AWAITING_DECISION');
    if (t.dueDateChanges >= REPEATED_SLIP_THRESHOLD) signals.push('REPEATED_DUE_DATE_CHANGES');
    if (signals.length === 0) continue;

    const highPriority = t.priority === 'HIGH' || t.priority === 'URGENT';
    let level: RiskLevel;
    if (overdue && (highPriority || blocked || daysLate(t, now) > SEVERE_OVERDUE_DAYS)) {
      level = 'HIGH';
    } else if (
      overdue ||
      t.dueDateChanges >= REPEATED_SLIP_THRESHOLD ||
      (dueSoon && (blocked || awaiting))
    ) {
      level = 'MEDIUM';
    } else {
      level = 'LOW';
    }

    risks.push({
      id: `risk:${t.id}`,
      level,
      what: `Task “${t.title}”`,
      signals,
      evidence: riskEvidence(t, now, overdue, blocked, dueSoon),
      recommendedAction: riskAction(t, level, overdue, blocked),
      projectId,
      taskId: t.id,
      destination: destination('TASK', workspaceId, projectId, t.id),
    });
  }

  // The project milestone itself: a target date passed or imminent while work remains.
  if (projectTargetDate && tasks.some(isOpen)) {
    const target = projectTargetDate.getTime();
    if (target < now) {
      risks.push(
        milestoneRisk(
          workspaceId,
          projectId,
          'HIGH',
          ['OVERDUE'],
          `The target date ${day(projectTargetDate)} has passed with open work.`,
          'Replan the target date or reduce scope to what is achievable.',
        ),
      );
    } else if (target <= now + windowDays * DAY_MS) {
      risks.push(
        milestoneRisk(
          workspaceId,
          projectId,
          'MEDIUM',
          ['DUE_SOON'],
          `The target date ${day(projectTargetDate)} is within ${windowDays} days with open work.`,
          'Confirm the remaining work is scheduled to land by the target date.',
        ),
      );
    }
  }

  const rank: Record<RiskLevel, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return risks.sort((a, b) => rank[a.level] - rank[b.level]);
}

function milestoneRisk(
  workspaceId: string,
  projectId: string,
  level: RiskLevel,
  signals: RiskSignalCode[],
  evidence: string,
  recommendedAction: string,
): RiskSignal {
  return {
    id: `risk:project:${projectId}:milestone`,
    level,
    what: 'Project target date',
    signals,
    evidence,
    recommendedAction,
    projectId,
    taskId: null,
    destination: destination('PROJECT', workspaceId, projectId, projectId),
  };
}

function riskEvidence(
  t: TaskSignal,
  now: number,
  overdue: boolean,
  blocked: boolean,
  dueSoon: boolean,
): string {
  const parts: string[] = [];
  if (overdue && t.dueDate) parts.push(`overdue by ${daysLate(t, now)} day(s)`);
  else if (dueSoon && t.dueDate) parts.push(`due ${day(t.dueDate)}`);
  if (blocked) parts.push(`waiting on ${t.prerequisites.length} unfinished prerequisite(s)`);
  if (isLongRunning(t, now)) parts.push('open for a long time');
  if (t.dueDateChanges >= REPEATED_SLIP_THRESHOLD)
    parts.push(`due date changed ${t.dueDateChanges}×`);
  return parts.join('; ') || 'open work';
}

function riskAction(t: TaskSignal, level: RiskLevel, overdue: boolean, blocked: boolean): string {
  if (overdue)
    return `Update or complete “${t.title}” — it is ${level === 'HIGH' ? 'critically ' : ''}overdue.`;
  if (blocked) return `Resolve the prerequisite blocking “${t.title}”.`;
  if (t.dueDate) return `Confirm “${t.title}” can be finished by ${day(t.dueDate)}.`;
  return `Review “${t.title}” — it has been open for a while.`;
}
