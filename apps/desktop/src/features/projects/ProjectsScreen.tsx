import { useEffect, useMemo, useState } from 'react';
import { FolderKanban, Plus, Search } from 'lucide-react';
import type { ProjectScope, ProjectView } from '@buildtogether/shared';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { useResource } from '../../hooks/useResource';
import { api } from '../../lib/data';
import { useAuth } from '../../state/AuthProvider';
import { NoWorkspace } from '../workspace/NoWorkspace';
import { CreateProjectDialog } from './CreateProjectDialog';
import { ProjectRow } from './ProjectRow';
import { ProjectWorkspace } from './ProjectWorkspace';

const SCOPES: ReadonlyArray<{ id: ProjectScope; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'archived', label: 'Archived' },
];

export function ProjectsScreen({ onOpenMessages }: { onOpenMessages: () => void }) {
  const { activeWorkspace, session } = useAuth();
  const [scope, setScope] = useState<ProjectScope>('active');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<ProjectView | null>(null);

  // Debounce the search box so typing does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const workspaceId = activeWorkspace?.id;
  const list = useResource<ProjectView[]>(
    () =>
      workspaceId
        ? api.projects.list(workspaceId, {
            scope,
            ...(search ? { search } : {}),
            sort: 'updatedAt',
            dir: 'desc',
          })
        : Promise.resolve([]),
    [workspaceId, scope, search],
  );

  const projects = useMemo(() => list.data ?? [], [list.data]);

  if (!activeWorkspace || !session) return <NoWorkspace />;

  // A selected project opens its own workspace view.
  if (selected) {
    return (
      <ProjectWorkspace
        project={selected}
        workspaceId={activeWorkspace.id}
        workspaceName={activeWorkspace.name}
        role={activeWorkspace.role}
        userId={session.user.id}
        onBack={() => setSelected(null)}
        onOpenMessages={onOpenMessages}
        onChanged={(updated) => {
          setSelected(updated);
          void list.reload();
        }}
      />
    );
  }

  const searching = search.length > 0;
  const showEmpty = !list.loading && !list.error && projects.length === 0;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display">Projects</h1>
          <p className="mt-1 text-sm text-secondary">
            Organize the work of{' '}
            <span className="font-medium text-primary">{activeWorkspace.name}</span>. Every project
            lives inside this workspace and its access is enforced by the server.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden="true" />
          New project
        </Button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Project scope"
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

        <div className="relative w-full max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            aria-label="Search projects"
            className="pl-8"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or key…"
          />
        </div>
      </div>

      {list.loading ? (
        <div className="overflow-hidden rounded-xl border border-border-default bg-surface-1">
          <div className="divide-y divide-border-subtle">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3">
                <Skeleton className="size-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-2.5 w-64" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ) : list.error ? (
        <Alert variant="error" title="Could not load projects">
          {list.error}
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={() => void list.reload()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : showEmpty ? (
        searching ? (
          <EmptyState
            icon={Search}
            title="No projects match your search"
            description={`Nothing matched “${search}” in the ${scope} projects. Try a different term.`}
            action={
              <Button variant="secondary" size="sm" onClick={() => setSearchInput('')}>
                Clear search
              </Button>
            }
          />
        ) : scope === 'archived' ? (
          <EmptyState
            icon={FolderKanban}
            title="No archived projects"
            description="When you archive a project it will appear here."
          />
        ) : (
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Create your first project to start organizing work in this workspace."
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="size-4" aria-hidden="true" />
                New project
              </Button>
            }
          />
        )
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-default bg-surface-1">
          <div className="divide-y divide-border-subtle">
            {projects.map((project) => (
              <ProjectRow key={project.id} project={project} onOpen={setSelected} />
            ))}
          </div>
        </div>
      )}

      <CreateProjectDialog
        open={creating}
        onClose={() => setCreating(false)}
        workspaceId={activeWorkspace.id}
        role={activeWorkspace.role}
        onCreated={(project) => {
          setCreating(false);
          void list.reload();
          setSelected(project);
        }}
      />
    </div>
  );
}
