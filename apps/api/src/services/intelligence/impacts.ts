import type { DecisionAffectedTask, DecisionRevisionImpact } from '@buildtogether/shared';
import type { DecisionSignal } from '../../repositories/intelligence.repo.js';
import { day } from './common.js';

/** A task brief resolved for the affected-task set (workspace-scoped, from the repo). */
export interface TaskBrief {
  id: string;
  title: string;
  status: string;
  assigneeName: string | null;
}

/**
 * Decision-revision impact (Phase 7 §5). Built entirely on Phase 6: a decision that was SUPERSEDED
 * (replaced by a newer one — `supersededById` set) has linked tasks that MAY need review. We surface
 * them WITH the reason, and the owner decides. We NEVER rewrite a task, mark related tasks invalid, or
 * drop decision history. A linked task that no longer exists is skipped — never fabricated.
 */
export function computeDecisionImpacts(
  decisions: DecisionSignal[],
  taskBriefs: Map<string, TaskBrief>,
): DecisionRevisionImpact[] {
  const impacts: DecisionRevisionImpact[] = [];

  for (const d of decisions.filter((x) => x.supersededById !== null)) {
    const affectedTasks: DecisionAffectedTask[] = [];
    const suffix = d.supersededByTitle ? ` by “${d.supersededByTitle}”` : '';
    const revisedOn = d.supersededAt ? day(d.supersededAt) : null;

    for (const taskId of d.linkedTaskIds) {
      const brief = taskBriefs.get(taskId);
      if (!brief) continue; // stale reference to a deleted task — skip, never invent
      affectedTasks.push({
        taskId: brief.id,
        title: brief.title,
        status: brief.status as DecisionAffectedTask['status'],
        assignee: brief.assigneeName ? { id: brief.id, name: brief.assigneeName } : null,
        reason: `Linked to “${d.title}”, which was superseded${suffix}${revisedOn ? ` on ${revisedOn}` : ''}.`,
      });
    }

    if (affectedTasks.length === 0) continue; // no live work depends on it — nothing to review

    impacts.push({
      decisionId: d.id,
      decisionTitle: d.title,
      revisedAt: (d.supersededAt ?? new Date(0)).toISOString(),
      supersededBy: d.supersededById
        ? { id: d.supersededById, title: d.supersededByTitle ?? '' }
        : null,
      projectId: d.projectId,
      affectedTasks,
    });
  }

  return impacts;
}
