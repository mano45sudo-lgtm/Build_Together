import { useEffect, useMemo, useState } from 'react';
import { Plus, Scale, Search } from 'lucide-react';
import type {
  DecisionDetailView,
  DecisionView,
  MemberSummary,
  ProjectView,
  WorkspaceRole,
} from '@buildtogether/shared';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { useResource } from '../../hooks/useResource';
import { api } from '../../lib/data';
import { canManageDecision } from '../../lib/rbac';
import { CreateDecisionDialog } from './CreateDecisionDialog';
import { DecisionDetail } from './DecisionDetail';
import { DecisionRow } from './DecisionRow';
import { ACTIVE_DECISION_STATUSES } from './decisionUtils';

export interface ProjectDecisionsPanelProps {
  workspaceId: string;
  /** The project these decisions belong to (also resolves a manager's rights). */
  project: ProjectView;
  role: WorkspaceRole;
  members: MemberSummary[];
  userId: string;
  loadingMembers: boolean;
}

/**
 * The Decisions section inside a project workspace: the project's own slice of the vault. It reuses the
 * exact row and detail of the workspace vault (one visual + data system), scoped by `projectId`. All
 * filtering and the visibility/management gate are server-driven; creating here pre-links the project so
 * the decision lands in this context.
 */
export function ProjectDecisionsPanel({
  workspaceId,
  project,
  role,
  members,
  userId,
  loadingMembers,
}: ProjectDecisionsPanelProps) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<DecisionDetailView | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const list = useResource<DecisionView[]>(
    () =>
      api.decisions.list(workspaceId, {
        projectId: project.id,
        ...(search ? { search } : {}),
        sort: 'updatedAt',
        dir: 'desc',
        limit: 100,
      }),
    [workspaceId, project.id, search],
  );

  const decisions = useMemo(() => list.data ?? [], [list.data]);
  const caller = { role, userId };

  const openDecision = (decision: DecisionView) => {
    void api.decisions
      .get(workspaceId, decision.id)
      .then(setSelected)
      .catch(() => setSelected(null));
  };

  if (selected) {
    const candidates = decisions.filter(
      (d) =>
        d.id !== selected.id && (ACTIVE_DECISION_STATUSES as readonly string[]).includes(d.status),
    );
    return (
      <DecisionDetail
        key={selected.id}
        decision={selected}
        workspaceId={workspaceId}
        members={members}
        candidates={candidates}
        canManage={canManageDecision(selected, caller, project)}
        userId={userId}
        onBack={() => setSelected(null)}
        onUpdated={(next) => {
          setSelected(next);
          list.setData((list.data ?? []).map((d) => (d.id === next.id ? next : d)));
        }}
        onOpenDecision={(id) => {
          const target = decisions.find((d) => d.id === id);
          if (target) openDecision(target);
        }}
        onDeleted={() => {
          setSelected(null);
          void list.reload();
        }}
      />
    );
  }

  const searching = search.length > 0;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            aria-label="Search decisions"
            className="pl-8"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search this project's decisions…"
          />
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden="true" />
          New decision
        </Button>
      </header>

      {list.loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : list.error ? (
        <Alert variant="error" title="Could not load decisions">
          {list.error}
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={() => void list.reload()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : decisions.length === 0 ? (
        <EmptyState
          icon={Scale}
          visual={searching ? undefined : 'decision'}
          title={searching ? 'No decisions match your search' : 'No decisions yet'}
          description={
            searching
              ? `Nothing matched “${search}” in this project. Try a different term.`
              : 'Record the choices this project has made so they stay traceable.'
          }
          action={
            searching ? (
              <Button variant="secondary" size="sm" onClick={() => setSearchInput('')}>
                Clear search
              </Button>
            ) : (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="size-4" aria-hidden="true" />
                New decision
              </Button>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-default bg-surface-1">
          <div className="divide-y divide-border-subtle">
            {decisions.map((decision) => (
              <DecisionRow key={decision.id} decision={decision} onOpen={openDecision} />
            ))}
          </div>
        </div>
      )}

      {loadingMembers ? <p className="text-2xs text-muted">Loading members…</p> : null}

      <CreateDecisionDialog
        open={creating}
        onClose={() => setCreating(false)}
        workspaceId={workspaceId}
        members={members}
        projects={[project]}
        defaultProjectId={project.id}
        userId={userId}
        onCreated={(decision) => {
          setCreating(false);
          void list.reload();
          setSelected(decision);
        }}
      />
    </div>
  );
}
