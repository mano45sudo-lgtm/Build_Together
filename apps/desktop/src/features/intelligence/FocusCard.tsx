import type { MyTaskView, PersonalIntelligence } from '@buildtogether/shared';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { useResource } from '../../hooks/useResource';
import { api } from '../../lib/data';
import { DismissibleSignal } from './DismissibleSignal';
import { LEVEL_TONE, levelLabel } from './intelligenceUtils';

function TaskLines({ title, tasks }: { title: string; tasks: MyTaskView[] }) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <h3 className="mb-1 text-xs font-medium text-secondary">
        {title} · {tasks.length}
      </h3>
      <ul className="space-y-1">
        {tasks.map((t) => (
          <li key={t.id} className="flex justify-between gap-3 text-sm">
            <span className="truncate text-primary">{t.title}</span>
            <span className="shrink-0 font-mono text-2xs text-muted">{t.project.projectKey}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * My Work "Focus": the personal signals the task lanes below cannot show — blocked work, work awaiting
 * review, and recommended next actions. Overdue/upcoming are omitted because the lanes already list them.
 */
export function FocusCard({ workspaceId }: { workspaceId: string }) {
  const focus = useResource<PersonalIntelligence>(
    () => api.intelligence.personal(workspaceId),
    [workspaceId],
  );

  if (focus.loading && !focus.data) return <Skeleton className="h-24 w-full" />;
  if (focus.error || !focus.data) {
    return (
      <Alert variant="error" title="Couldn't load your focus">
        {focus.error ?? 'No data returned.'}
      </Alert>
    );
  }

  const { blocked, awaitingMyReview, recommendations } = focus.data;
  if (blocked.length + awaitingMyReview.length + recommendations.length === 0) return null;

  return (
    <Card title="Focus" description="What needs you now, with the evidence behind each suggestion.">
      <div className="space-y-4">
        <TaskLines title="Blocked" tasks={blocked} />
        <TaskLines title="Awaiting your review" tasks={awaitingMyReview} />
        {recommendations.length > 0 ? (
          <ul className="divide-y divide-border-subtle">
            {recommendations.map((r) => (
              <DismissibleSignal
                key={r.id}
                workspaceId={workspaceId}
                kind="RECOMMENDATION"
                signalId={r.id}
                canResolve
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-primary">{r.action}</p>
                  <Badge tone={LEVEL_TONE[r.priority]}>{levelLabel(r.priority)}</Badge>
                </div>
                <p className="text-xs text-secondary">{r.reason}</p>
              </DismissibleSignal>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}
