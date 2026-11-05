import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, List as ListIcon, Plus, Scale, Search } from 'lucide-react';
import type {
  DecisionCategory,
  DecisionDetailView,
  DecisionView,
  MemberSummary,
  ProjectView,
} from '@buildtogether/shared';
import { DECISION_CATEGORIES } from '@buildtogether/shared';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { useResource } from '../../hooks/useResource';
import { api } from '../../lib/data';
import { canManageDecision } from '../../lib/rbac';
import { useAuth } from '../../state/AuthProvider';
import { NoWorkspace } from '../workspace/NoWorkspace';
import { CreateDecisionDialog } from './CreateDecisionDialog';
import { DecisionDetail } from './DecisionDetail';
import { DecisionRow } from './DecisionRow';
import {
  ACTIVE_DECISION_STATUSES,
  DECISION_STATUS_ORDER,
  decisionStatusLabel,
  decisionStatusTone,
} from './decisionUtils';

const CONTROL =
  'h-9 rounded-md border border-border-default bg-surface-2 px-3 text-sm text-primary focus-visible:border-accent focus-visible:outline-none';

type Scope = 'active' | 'all' | 'closed';
const SCOPES: ReadonlyArray<{ id: Scope; label: string }> = [
  { id: 'active', label: 'Active' },
  { id: 'all', label: 'All' },
  { id: 'closed', label: 'Closed' },
];

/**
 * The Decision Vault (Phase 6): a workspace-scoped library of the decisions a team has made and why.
 * It mirrors the projects/tasks surfaces exactly — same header, segmented scope, search, divided rows,
 * skeletons, honest empty/error states — so it reads as one coherent app, not a new design.
 *
 * Filtering is server-driven (search + category + sort reach the API; the vault never re-implements the
 * visibility gate); scope (Active / All / Closed) and grouped vs list are presentation choices over the
 * returned set. Selecting a row loads the full detail record. Nothing here is auto-derived: decisions
 * are written deliberately by a person.
 */
export function DecisionsScreen() {
  const { activeWorkspace, session } = useAuth();
  const [scope, setScope] = useState<Scope>('active');
  const [view, setView] = useState<'grouped' | 'list'>('grouped');
  const [category, setCategory] = useState<DecisionCategory | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<DecisionDetailView | null>(null);

  // Debounce the search box so typing does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const workspaceId = activeWorkspace?.id;

  const decisions = useResource<DecisionView[]>(
    () =>
      workspaceId
        ? api.decisions.list(workspaceId, {
            ...(category ? { category } : {}),
            ...(search ? { search } : {}),
            sort: 'updatedAt',
            dir: 'desc',
            limit: 100,
          })
        : Promise.resolve([]),
    [workspaceId, category, search],
  );

  // Projects resolve a decision's manage rights and feed the create-context picker; members feed the
  // owner / participant selects. Both are real, authorized reads the detail relies on.
  const projects = useResource<ProjectView[]>(
    () =>
      workspaceId
        ? api.projects.list(workspaceId, { sort: 'updatedAt', dir: 'desc' })
        : Promise.resolve([]),
    [workspaceId],
  );
  const members = useResource<MemberSummary[]>(
    () => (workspaceId ? api.members.list(workspaceId) : Promise.resolve([])),
    [workspaceId],
  );

  if (!activeWorkspace || !session) return <NoWorkspace />;

  const projectMap = new Map((projects.data ?? []).map((p) => [p.id, p]));
  const caller = { role: activeWorkspace.role, userId: session.user.id };

  const replaceDecision = (next: DecisionDetailView) => {
    setSelected(next);
    decisions.setData((decisions.data ?? []).map((d) => (d.id === next.id ? next : d)));
  };

  const openDecision = (decision: DecisionView) => {
    void api.decisions
      .get(workspaceId!, decision.id)
      .then(setSelected)
      .catch(() => setSelected(null));
  };

  if (selected) {
    const linkedProject = selected.projectId ? projectMap.get(selected.projectId) : undefined;
    // Supersede / decision-reference targets: other live decisions in the current vault set.
    const candidates = (decisions.data ?? []).filter(
      (d) =>
        d.id !== selected.id && (ACTIVE_DECISION_STATUSES as readonly string[]).includes(d.status),
    );
    return (
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <DecisionDetail
          // Remount when navigating to a different decision (supersede target / referenced decision)
          // so the detail's inline edit buffers re-seed from the newly opened record, not the prior one.
          key={selected.id}
          decision={selected}
          workspaceId={activeWorkspace.id}
          members={members.data ?? []}
          candidates={candidates}
          canManage={canManageDecision(selected, caller, linkedProject)}
          userId={session.user.id}
          onBack={() => setSelected(null)}
          onUpdated={replaceDecision}
          onOpenDecision={(id) => {
            const target = (decisions.data ?? []).find((d) => d.id === id);
            if (target) openDecision(target);
          }}
          onDeleted={() => {
            setSelected(null);
            void decisions.reload();
          }}
        />
      </div>
    );
  }

  const all = decisions.data ?? [];
  const visible = all.filter((d) => {
    if (scope === 'all') return true;
    if (scope === 'active')
      return (ACTIVE_DECISION_STATUSES as readonly string[]).includes(d.status);
    return d.status === 'SUPERSEDED' || d.status === 'ARCHIVED';
  });

  const filtersActive = search.length > 0 || category !== '';
  const loading = decisions.loading;
  const showEmpty = !loading && !decisions.error && visible.length === 0;

  const grouped = useMemo(() => {
    const byStatus = new Map<string, DecisionView[]>();
    for (const d of visible) {
      const bucket = byStatus.get(d.status) ?? [];
      bucket.push(d);
      byStatus.set(d.status, bucket);
    }
    return DECISION_STATUS_ORDER.map((status) => ({
      status,
      items: byStatus.get(status) ?? [],
    })).filter((g) => g.items.length > 0);
  }, [visible]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display">Decisions</h1>
          <p className="mt-1 text-sm text-secondary">
            The durable record of what{' '}
            <span className="font-medium text-primary">{activeWorkspace.name}</span> decided, and
            why. Every decision is written by a person and stays traceable to its context.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden="true" />
          New decision
        </Button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="Decision scope"
            className="inline-flex rounded-lg border border-border-default bg-surface-1 p-0.5"
          >
            {SCOPES.map(({ id, label }) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={scope === id}
                onClick={() => setScope(id)}
                className={
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
                  (scope === id ? 'bg-surface-3 text-primary' : 'text-secondary hover:text-primary')
                }
              >
                {label}
              </button>
            ))}
          </div>

          <select
            aria-label="Filter by category"
            className={CONTROL}
            value={category}
            onChange={(e) => setCategory(e.target.value as DecisionCategory | '')}
          >
            <option value="">All categories</option>
            {DECISION_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0) + c.slice(1).toLowerCase()}
              </option>
            ))}
          </select>

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
              placeholder="Search title or decision…"
            />
          </div>

          {filtersActive ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchInput('');
                setCategory('');
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>

        <div
          role="tablist"
          aria-label="Decision view"
          className="inline-flex rounded-lg border border-border-default bg-surface-1 p-0.5"
        >
          <button
            role="tab"
            type="button"
            aria-selected={view === 'grouped'}
            onClick={() => setView('grouped')}
            className={
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ' +
              (view === 'grouped'
                ? 'bg-surface-3 text-primary'
                : 'text-secondary hover:text-primary')
            }
          >
            <LayoutGrid className="size-4" aria-hidden="true" />
            Grouped
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={view === 'list'}
            onClick={() => setView('list')}
            className={
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ' +
              (view === 'list' ? 'bg-surface-3 text-primary' : 'text-secondary hover:text-primary')
            }
          >
            <ListIcon className="size-4" aria-hidden="true" />
            List
          </button>
        </div>
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-xl border border-border-default bg-surface-1">
          <div className="divide-y divide-border-subtle">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-48" />
                  <Skeleton className="h-2.5 w-72" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ) : decisions.error ? (
        <Alert variant="error" title="Could not load decisions">
          {decisions.error}
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={() => void decisions.reload()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : showEmpty ? (
        filtersActive ? (
          <EmptyState
            icon={Search}
            title="No decisions match your filters"
            description="Nothing matched the current search, category or scope. Try clearing a filter."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearchInput('');
                  setCategory('');
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : scope === 'closed' ? (
          <EmptyState
            icon={Scale}
            title="No closed decisions"
            description="Superseded and archived decisions will appear here for reference."
          />
        ) : (
          <EmptyState
            icon={Scale}
            title="No decisions yet"
            description="Record your first decision to give this workspace a durable, traceable history."
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="size-4" aria-hidden="true" />
                New decision
              </Button>
            }
          />
        )
      ) : view === 'grouped' ? (
        <div className="space-y-5">
          {grouped.map(({ status, items }) => (
            <section key={status} aria-label={`${decisionStatusLabel(status)} decisions`}>
              <div className="mb-1.5 flex items-center justify-between px-1">
                <Badge tone={decisionStatusTone(status)}>{decisionStatusLabel(status)}</Badge>
                <span className="font-mono text-2xs text-muted">{items.length}</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-border-default bg-surface-1">
                <div className="divide-y divide-border-subtle">
                  {items.map((decision) => (
                    <DecisionRow key={decision.id} decision={decision} onOpen={openDecision} />
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-default bg-surface-1">
          <div className="divide-y divide-border-subtle">
            {visible.map((decision) => (
              <DecisionRow key={decision.id} decision={decision} onOpen={openDecision} />
            ))}
          </div>
        </div>
      )}

      <CreateDecisionDialog
        open={creating}
        onClose={() => setCreating(false)}
        workspaceId={activeWorkspace.id}
        members={members.data ?? []}
        projects={projects.data ?? []}
        userId={session.user.id}
        onCreated={(decision) => {
          setCreating(false);
          void decisions.reload();
          setSelected(decision);
        }}
      />
    </div>
  );
}
