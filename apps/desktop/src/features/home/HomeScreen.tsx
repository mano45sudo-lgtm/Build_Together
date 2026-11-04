import { useState } from 'react';
import { Folder, FolderKanban, Plus, Users } from 'lucide-react';
import type { ProjectView, WorkspaceSummary } from '@buildtogether/shared';
import { Alert } from '../../components/ui/Alert';
import { Badge, roleTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { useResource } from '../../hooks/useResource';
import { api } from '../../lib/data';
import { useAuth } from '../../state/AuthProvider';
import { AcceptInviteCard } from '../invitations/AcceptInviteCard';
import { CreateWorkspaceDialog } from '../workspace/CreateWorkspaceDialog';
import { NoWorkspace } from '../workspace/NoWorkspace';
import { ProjectRow } from '../projects/ProjectRow';

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/**
 * Signed-in home — "what to continue" (redesign brief §4.2). It surfaces only what is real today:
 * the active workspace, projects with recent activity, and pending invitations. No invented metrics,
 * scores, or decorative analytics.
 */
export function HomeScreen({
  onOpenTeam,
  onOpenProjects,
}: {
  onOpenTeam: () => void;
  onOpenProjects: () => void;
}) {
  const { session, activeWorkspace, setActiveWorkspaceId, refresh } = useAuth();
  const [creating, setCreating] = useState(false);

  const workspaceId = activeWorkspace?.id;
  const recent = useResource<ProjectView[]>(
    () =>
      workspaceId
        ? api.projects.list(workspaceId, {
            scope: 'active',
            sort: 'updatedAt',
            dir: 'desc',
            limit: 5,
          })
        : Promise.resolve([]),
    [workspaceId],
  );

  if (!session) return null;
  if (!activeWorkspace) return <NoWorkspace />;

  const onAccepted = (workspace: WorkspaceSummary) => {
    setActiveWorkspaceId(workspace.id);
    void refresh();
  };

  const projects = recent.data ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <h1 className="text-display">Welcome back, {firstName(session.user.name)}</h1>
        <p className="mt-1 text-sm text-secondary">You are signed in as {session.user.email}.</p>
      </header>

      <Card
        title="Active workspace"
        action={<Badge tone={roleTone(activeWorkspace.role)}>{activeWorkspace.role}</Badge>}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-primary">{activeWorkspace.name}</p>
            <p className="mt-0.5 text-sm text-secondary">
              {activeWorkspace.memberCount}{' '}
              {activeWorkspace.memberCount === 1 ? 'member' : 'members'}
              {activeWorkspace.description ? ` · ${activeWorkspace.description}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onOpenTeam}>
              <Users className="size-3.5" aria-hidden="true" />
              Members
            </Button>
            <Button variant="secondary" size="sm" onClick={onOpenProjects}>
              <Folder className="size-3.5" aria-hidden="true" />
              Projects
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" aria-hidden="true" />
              New workspace
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <AcceptInviteCard onAccepted={onAccepted} />

        <Card
          title="Recent projects"
          description="Recently updated in this workspace."
          action={
            projects.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={onOpenProjects}>
                View all
              </Button>
            ) : null
          }
          bodyClassName="p-0"
        >
          {recent.loading ? (
            <div className="divide-y divide-border-subtle">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-3">
                  <Skeleton className="size-9 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-2.5 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : recent.error ? (
            <div className="px-5 py-4">
              <Alert variant="error" title="Could not load projects">
                {recent.error}
              </Alert>
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-start gap-3 px-5 py-6">
              <p className="text-sm text-secondary">
                No active projects yet. Projects organize the work of this workspace.
              </p>
              <Button size="sm" onClick={onOpenProjects}>
                <FolderKanban className="size-4" aria-hidden="true" />
                Go to projects
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {projects.map((project) => (
                <ProjectRow key={project.id} project={project} onOpen={() => onOpenProjects()} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <CreateWorkspaceDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(created) => {
          setCreating(false);
          setActiveWorkspaceId(created.id);
          void refresh();
        }}
      />
    </div>
  );
}
