import { Gauge } from 'lucide-react';
import type { ProjectIntelligenceOverview } from '@buildtogether/shared';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useResource } from '../../hooks/useResource';
import { api } from '../../lib/data';
import { DismissibleSignal } from './DismissibleSignal';
import { HEALTH, LEVEL_TONE, levelLabel } from './intelligenceUtils';

function Detail({ label, children }: { label: string; children: string }) {
  return (
    <p className="text-xs text-secondary">
      <span className="font-medium text-primary">{label}:</span> {children}
    </p>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="py-2 text-sm text-muted">{children}</p>;
}

/** Project execution intelligence: deterministic, explainable, computed on read by the server. */
export function ProjectIntelligencePanel({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const overview = useResource<ProjectIntelligenceOverview>(
    () => api.intelligence.overview(workspaceId, projectId),
    [workspaceId, projectId],
  );

  if (overview.loading && !overview.data) return <Skeleton className="h-64 w-full" />;
  if (overview.error || !overview.data) {
    return (
      <Alert variant="error" title="Couldn't load project intelligence">
        <p>{overview.error ?? 'No data returned.'}</p>
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          onClick={() => void overview.reload()}
        >
          Try again
        </Button>
      </Alert>
    );
  }

  const { health, blockers, risks, recommendations, decisionImpacts } = overview.data;
  const m = health.metrics;
  const state = HEALTH[health.state];
  const signal = { workspaceId };

  return (
    <div className="space-y-5">
      <Card
        title="Project health"
        description={`Computed ${new Date(health.computedAt).toLocaleString()} from live project data.`}
        action={<Badge tone={state.tone}>{state.label}</Badge>}
      >
        {m.totalTasks === 0 ? (
          <EmptyState
            icon={Gauge}
            title="No tasks yet"
            description="Health appears once this project has tasks."
          />
        ) : (
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex justify-between text-xs text-secondary">
                <span>
                  {m.completedTasks} of {m.totalTasks} tasks done
                </span>
                <span>{Math.round(m.completionRatio * 100)}%</span>
              </div>
              <div
                className="h-1.5 rounded-full bg-surface-3"
                role="progressbar"
                aria-label="Task completion"
                aria-valuenow={Math.round(m.completionRatio * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.round(m.completionRatio * 100)}%` }}
                />
              </div>
            </div>
            {health.factors.length === 0 ? (
              <Empty>Nothing needs attention.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {health.factors.map((f) => (
                  <li key={f.code} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-primary">{f.label}</span>
                    {f.severity !== 'NONE' ? (
                      <Badge tone={f.severity === 'RISK' ? 'danger' : 'warning'}>
                        {f.severity === 'RISK' ? 'Risk' : 'Attention'}
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <Card
        title="Next best actions"
        description="Evidence-backed suggestions. Nothing runs automatically."
      >
        {recommendations.length === 0 ? (
          <Empty>No recommended actions right now.</Empty>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {recommendations.map((r) => (
              <DismissibleSignal
                key={r.id}
                {...signal}
                kind="RECOMMENDATION"
                signalId={r.id}
                canResolve
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-primary">{r.action}</p>
                  <Badge tone={LEVEL_TONE[r.priority]}>{levelLabel(r.priority)}</Badge>
                </div>
                <Detail label="Why">{r.reason}</Detail>
                <Detail label="Evidence">{r.evidence}</Detail>
              </DismissibleSignal>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Blockers" description="Work that cannot progress, and who can unblock it.">
        {blockers.length === 0 ? (
          <Empty>No blockers.</Empty>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {blockers.map((b) => (
              <DismissibleSignal key={b.id} {...signal} kind="BLOCKER" signalId={b.id}>
                <p className="text-sm font-medium text-primary">{b.description}</p>
                <Detail label="Evidence">{b.evidence}</Detail>
                <Detail label="Next step">{b.suggestedAction}</Detail>
                {b.responsible ? <Detail label="Responsible">{b.responsible.name}</Detail> : null}
              </DismissibleSignal>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Risks" description="Deadline and dependency risks, each with its evidence.">
        {risks.length === 0 ? (
          <Empty>No risks detected.</Empty>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {risks.map((r) => (
              <DismissibleSignal key={r.id} {...signal} kind="RISK" signalId={r.id}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-primary">{r.what}</p>
                  <Badge tone={LEVEL_TONE[r.level]}>{levelLabel(r.level)} risk</Badge>
                </div>
                <Detail label="Evidence">{r.evidence}</Detail>
                <Detail label="Recommended">{r.recommendedAction}</Detail>
              </DismissibleSignal>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Decision changes"
        description="Tasks that may need review because a linked decision was revised."
      >
        {decisionImpacts.length === 0 ? (
          <Empty>No revised decisions affect open work.</Empty>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {decisionImpacts.map((d) => (
              <li key={d.decisionId} className="space-y-1.5 py-3">
                <p className="text-sm font-medium text-primary">
                  {d.decisionTitle}
                  {d.supersededBy ? (
                    <span className="font-normal text-secondary">
                      {' '}
                      → superseded by {d.supersededBy.title}
                    </span>
                  ) : null}
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-secondary">
                  {d.affectedTasks.map((t) => (
                    <li key={t.taskId}>
                      <span className="text-primary">{t.title}</span>
                      {t.assignee ? ` · ${t.assignee.name}` : ''} — {t.reason}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
