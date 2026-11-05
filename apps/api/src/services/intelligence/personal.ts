import type { MyTaskView, PersonalIntelligence } from '@buildtogether/shared';
import { DAY_MS } from './common.js';
import { buildPersonalRecommendations } from './recommendations.js';

/**
 * Personal execution intelligence (Phase 7 §6). Pure bucketing over the caller's OWN visible work —
 * the orchestrator feeds it `task.service.listMyTasks`, which is already project-visibility-filtered
 * and carries the derived `blocked` flag, so this layer never re-queries and never leaks another
 * user's tasks. Buckets are the same deterministic rules the project engine uses (overdue / due-soon /
 * blocked / awaiting review), just scoped to "me".
 */

const dueTime = (t: MyTaskView): number =>
  t.dueDate ? Date.parse(t.dueDate) : Number.MAX_SAFE_INTEGER;
const isOpenTask = (t: MyTaskView): boolean => t.status !== 'DONE';

export function buildPersonalIntelligence(
  workspaceId: string,
  userId: string,
  rows: MyTaskView[],
  now: number,
  windowDays: number,
): PersonalIntelligence {
  const open = rows.filter(isOpenTask);
  const byDueAsc = (a: MyTaskView, b: MyTaskView): number => dueTime(a) - dueTime(b);

  const overdue = open
    .filter((t) => t.dueDate !== null && Date.parse(t.dueDate) < now)
    .sort(byDueAsc);
  const upcoming = open
    .filter((t) => {
      if (t.dueDate === null) return false;
      const due = Date.parse(t.dueDate);
      return due >= now && due <= now + windowDays * DAY_MS;
    })
    .sort(byDueAsc);
  const blocked = open.filter((t) => t.blocked);
  const awaitingMyReview = rows.filter((t) => t.status === 'IN_REVIEW');

  return {
    userId,
    overdue,
    upcoming,
    blocked,
    awaitingMyReview,
    recommendations: buildPersonalRecommendations(workspaceId, open, now),
  };
}
