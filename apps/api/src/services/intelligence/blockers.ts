import type { Blocker, BlockerSource } from '@buildtogether/shared';
import type { DecisionSignal, TaskSignal } from '../../repositories/intelligence.repo.js';
import {
  day,
  decisionsPendingFor,
  destination,
  drivingPrerequisite,
  isOpen,
  person,
} from './common.js';

/**
 * Structured blocker detection (Phase 7 §C). Sources are the ones expressible in stored data: an
 * unfinished prerequisite, an OVERDUE prerequisite, a task waiting on an unapproved decision, and a
 * decision itself awaiting review. It REUSES the derived unfinished-prerequisite relationship — there
 * is no stored "blocked" task status, and detection never changes a task. "Unresolved clarification
 * requests" (§C ex. 6) is intentionally absent: no clarification entity exists, and we never fabricate.
 * AI-detected (conversation) blockers are a later, clearly-marked suggestion seam, not this.
 */
export function detectBlockers(
  workspaceId: string,
  projectId: string,
  tasks: TaskSignal[],
  decisions: DecisionSignal[],
  now: number,
): Blocker[] {
  const blockers: Blocker[] = [];

  for (const t of tasks.filter(isOpen)) {
    // 1 + 2 + 3: cannot progress while an unfinished prerequisite exists (overdue prerequisite escalates).
    const prereq = drivingPrerequisite(t, now);
    if (prereq) {
      const source: BlockerSource =
        prereq.dueDate && prereq.dueDate.getTime() < now
          ? 'OVERDUE_PREREQUISITE'
          : 'UNFINISHED_PREREQUISITE';
      blockers.push({
        id: `blocker:${t.id}:${source}`,
        source,
        status: 'OPEN',
        description: `“${t.title}” is waiting on an unfinished prerequisite.`,
        projectId,
        taskId: t.id,
        responsible: person(t.assignee),
        evidence:
          source === 'OVERDUE_PREREQUISITE'
            ? `Prerequisite “${prereq.title}” is past its due date (${day(prereq.dueDate as Date)}) and not done.`
            : `Prerequisite “${prereq.title}” is not complete.`,
        suggestedAction: `Complete or replan “${prereq.title}”, or remove the dependency.`,
        destination: destination('TASK', workspaceId, projectId, t.id),
      });
    }

    // 4: a task waiting on a decision that has not been approved.
    const pending = decisionsPendingFor(t.id, decisions);
    const d = pending[0];
    if (d) {
      blockers.push({
        id: `blocker:${t.id}:AWAITING_DECISION`,
        source: 'AWAITING_DECISION',
        status: 'OPEN',
        description: `“${t.title}” is waiting on decision “${d.title}”.`,
        projectId,
        taskId: t.id,
        responsible: person(t.assignee),
        evidence: `Decision “${d.title}” is still ${d.status.toLowerCase()} and is linked to this task.`,
        suggestedAction: `Move decision “${d.title}” forward so this task can proceed.`,
        destination: destination('TASK', workspaceId, projectId, t.id),
      });
    }
  }

  // 5: a decision awaiting review is itself a progress blocker for the project.
  for (const d of decisions.filter((x) => x.status === 'PROPOSED')) {
    blockers.push({
      id: `blocker:${d.id}:DECISION_NEEDS_REVIEW`,
      source: 'DECISION_NEEDS_REVIEW',
      status: 'OPEN',
      description: `Decision “${d.title}” is proposed and awaiting review.`,
      projectId,
      taskId: null,
      responsible: null,
      evidence: `Still unapproved. Evaluated ${day(now)}.`,
      suggestedAction: `Approve or reject decision “${d.title}”.`,
      destination: destination('DECISION', workspaceId, projectId, d.id),
    });
  }

  return blockers;
}
