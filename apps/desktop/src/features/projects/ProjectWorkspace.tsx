import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  FolderKanban,
  Gauge,
  ListTodo,
  MessageSquare,
  Scale,
  Settings2,
} from 'lucide-react';
import type { MemberSummary, ProjectView, WorkspaceRole } from '@buildtogether/shared';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useResource } from '../../hooks/useResource';
import { api } from '../../lib/data';
import { canManageProject } from '../../lib/rbac';
import { ProjectDecisionsPanel } from '../decisions/ProjectDecisionsPanel';
import { ProjectIntelligencePanel } from '../intelligence/ProjectIntelligencePanel';
import { TasksPanel } from '../tasks/TasksPanel';
import {
  formatProjectDate,
  projectStatusLabel,
  projectStatusTone,
  projectVisibilityLabel,
  projectVisibilityTone,
} from './projectUtils';
import { ProjectSettingsPanel } from './ProjectSettingsPanel';

type Tab = 'overview' | 'intelligence' | 'tasks' | 'decisions' | 'conversations' | 'settings';

const TABS: ReadonlyArray<{ id: Tab; label: string; icon: typeof FolderKanban }> = [
  { id: 'overview', label: 'Overview', icon: FolderKanban },
  { id: 'intelligence', label: 'Intelligence', icon: Gauge },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'decisions', label: 'Decisions', icon: Scale },
  { id: 'conversations', label: 'Conversations', icon: MessageSquare },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm text-primary">{value}</dd>
    </div>
  );
}

function OverviewPanel({ project }: { project: ProjectView }) {
  return (
    <Card title="Overview" description="Project details. Tasks and boards arrive in a later phase.">
      <div className="space-y-4">
        {project.description ? (
          <p className="text-sm text-secondary">{project.description}</p>
        ) : (
          <p className="text-sm italic text-muted">No description.</p>
        )}
        <dl className="divide-y divide-border-subtle">
          <Row label="Project key" value={project.projectKey} />
          <Row label="Slug" value={project.slug} />
          <Row label="Owner" value={project.owner.name} />
          <Row label="Status" value={projectStatusLabel(project.status)} />
          <Row label="Visibility" value={projectVisibilityLabel(project.visibility)} />
          <Row label="Start date" value={formatProjectDate(project.startDate)} />
          <Row label="Target date" value={formatProjectDate(project.targetDate)} />
          <Row label="Created" value={formatProjectDate(project.createdAt)} />
          {project.archivedAt ? (
            <Row label="Archived" value={formatProjectDate(project.archivedAt)} />
          ) : null}
        </dl>
      </div>
    </Card>
  );
}

/**
 * Project-scoped conversations are NOT yet available: Phase 3 wired workspace-level Nexconn
 * conversations only, and we never invent SDK capability or fake screens (CLAUDE.md). This panel is an
 * honest bridge — it explains the state and routes to the workspace conversations that DO exist.
 */
function ConversationsPanel({ onOpenMessages }: { onOpenMessages: () => void }) {
  return (
    <EmptyState
      icon={MessageSquare}
      title="Project conversations are coming"
      description="Phase 4 delivered the projects foundation. Workspace conversations are live now; conversations scoped to a single project arrive in a later phase."
      action={
        <Button variant="secondary" size="sm" onClick={onOpenMessages}>
          <MessageSquare className="size-3.5" aria-hidden="true" />
          Open workspace messages
        </Button>
      }
    />
  );
}

export interface ProjectWorkspaceProps {
  project: ProjectView;
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
  userId: string;
  onBack: () => void;
  onChanged: (project: ProjectView) => void;
  onOpenMessages: () => void;
}

/** A single project's workspace: identity header plus Overview / Conversations / Settings tabs. */
export function ProjectWorkspace({
  project,
  workspaceId,
  workspaceName,
  role,
  userId,
  onBack,
  onChanged,
  onOpenMessages,
}: ProjectWorkspaceProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const canManage = useMemo(
    () => canManageProject(project, { role, userId }),
    [project, role, userId],
  );

  // Members feed the assignee pickers (Tasks + Settings) and the decision owner/participant pickers
  // (Decisions). Viewers need the roster to act at create; the server still validates membership on
  // every write. Fetch lazily only when a tab uses it.
  const roster = useResource<MemberSummary[]>(
    () =>
      canManage || tab === 'tasks' || tab === 'decisions'
        ? api.members.list(workspaceId)
        : Promise.resolve([]),
    [workspaceId, canManage, tab],
  );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          All projects
        </Button>
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-2 text-xl"
            style={project.color ? { color: project.color } : undefined}
            aria-hidden="true"
          >
            {project.icon ?? <FolderKanban className="size-5 text-muted" />}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-display">{project.name}</h1>
            <p className="truncate text-sm text-secondary">
              <span className="font-mono text-2xs">{project.projectKey}</span> · {workspaceName}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {project.archivedAt ? <Badge tone="neutral">Archived</Badge> : null}
          <Badge tone={projectVisibilityTone(project.visibility)}>
            {projectVisibilityLabel(project.visibility)}
          </Badge>
          <Badge tone={projectStatusTone(project.status)}>
            {projectStatusLabel(project.status)}
          </Badge>
        </div>
      </header>

      <nav aria-label="Project sections" className="flex gap-1 border-b border-border-subtle">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id ? 'page' : undefined}
            className={
              'flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
              (tab === id
                ? 'border-accent text-primary'
                : 'border-transparent text-secondary hover:text-primary')
            }
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' ? <OverviewPanel project={project} /> : null}
      {tab === 'intelligence' ? (
        <ProjectIntelligencePanel workspaceId={workspaceId} projectId={project.id} />
      ) : null}
      {tab === 'tasks' ? (
        <TasksPanel
          workspaceId={workspaceId}
          projectId={project.id}
          members={roster.data ?? []}
          userId={userId}
          canManage={canManage}
          loadingMembers={roster.loading}
        />
      ) : null}
      {tab === 'conversations' ? <ConversationsPanel onOpenMessages={onOpenMessages} /> : null}
      {tab === 'decisions' ? (
        <ProjectDecisionsPanel
          workspaceId={workspaceId}
          project={project}
          role={role}
          members={roster.data ?? []}
          userId={userId}
          loadingMembers={roster.loading}
        />
      ) : null}
      {tab === 'settings' ? (
        roster.loading && canManage ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <ProjectSettingsPanel
            project={project}
            workspaceId={workspaceId}
            members={roster.data ?? []}
            canManage={canManage}
            loadingMembers={roster.loading}
            onUpdated={onChanged}
          />
        )
      ) : null}
    </div>
  );
}
