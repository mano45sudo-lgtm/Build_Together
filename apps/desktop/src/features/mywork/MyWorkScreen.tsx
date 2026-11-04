import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, CircleDot } from 'lucide-react';
import type { MemberSummary, MyTaskView, TaskStatus, TaskView } from '@buildtogether/shared';
import { TASK_STATUSES } from '@buildtogether/shared';
import { Alert } from '../../components/ui/Alert';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useResource } from '../../hooks/useResource';
import { errorMessage } from '../../lib/bridge';
import { api } from '../../lib/data';
import { useAuth } from '../../state/AuthProvider';
import { NoWorkspace } from '../workspace/NoWorkspace';
import { TaskDetail } from '../tasks/TaskDetail';
import {
  isOverdue,
  taskDueLabel,
  taskPriorityLabel,
  taskPriorityTone,
  taskStatusLabel,
} from '../tasks/taskUtils';

const CONTROL =
  'h-8 rounded-md border border-border-default bg-surface-2 px-2 text-2xs text-primary focus-visible:border-accent focus-visible:outline-none';

type Bucket = 'upcoming' | 'inprogress' | 'overdue' | 'completed';

/** Mutually-exclusive grouping by precedence so a task appears in exactly one lane (brief §6). */
function bucketOf(task: MyTaskView): Bucket {
  if (task.status === 'DONE') return 'completed';
  if (isOverdue(task.dueDate, task.status)) return 'overdue';
  if (task.status === 'IN_PROGRESS' || task.status === 'IN_REVIEW') return 'inprogress';
  return 'upcoming';
}

const LANES: ReadonlyArray<{ id: Bucket; label: string; hint: string }> = [
  { id: 'upcoming', label: 'Upcoming', hint: 'Assigned to you, not started yet.' },
  { id: 'inprogress', label: 'In Progress', hint: 'You are actively working on these.' },
  { id: 'overdue', label: 'Overdue', hint: 'Past their due date and not done.' },
  { id: 'completed', label: 'Completed', hint: 'Finished work assigned to you.' },
];

/**
 * My Work — the execution view across the authenticated user's accessible projects (brief §6). It reads
 * ONLY real assigned tasks from the server (no mocks): `assigned-to-me` returns tasks where the caller is
 * the assignee, narrowed server-side to projects they can see. Grouped into Upcoming / In Progress /
 * Overdue / Completed, showing the owning project, priority and due date, with quick status updates and a
 * focused detail for each task. Workspace access + membership are enforced by the server every request.
 */
export function MyWorkScreen() {
  const { session, activeWorkspace } = useAuth();
  const [banner, setBanner] = useState<string | null>(null);
  const [selected, setSelected] = useState<TaskView | null>(null);

  const workspaceId = activeWorkspace?.id;
  const list = useResource<MyTaskView[]>(
    () => (workspaceId ? api.tasks.assignedToMe(workspaceId) : Promise.resolve([])),
    [workspaceId],
  );
  const roster = useResource<MemberSummary[]>(
    () => (workspaceId ? api.members.list(workspaceId) : Promise.resolve([])),
    [workspaceId],
  );

  // Dependency candidates for the detail, loaded for the selected task's project.
  const selectedProjectId = selected?.projectId;
  const siblings = useResource<TaskView[]>(
    () =>
      workspaceId && selectedProjectId
        ? api.tasks.list(workspaceId, selectedProjectId, { limit: 100 })
        : Promise.resolve([]),
    [workspaceId, selectedProjectId],
  );

  const grouped = useMemo(() => {
    const map: Record<Bucket, MyTaskView[]> = {
      upcoming: [],
      inprogress: [],
      overdue: [],
      completed: [],
    };
    for (const task of list.data ?? []) map[bucketOf(task)].push(task);
    return map;
  }, [list.data]);

  if (!session || !activeWorkspace) return <NoWorkspace />;

  const replaceTask = (next: TaskView) => {
    list.setData(
      (list.data ?? []).map((t) => (t.id === next.id ? ({ ...t, ...next } as MyTaskView) : t)),
    );
    setSelected((cur) => (cur && cur.id === next.id ? next : cur));
  };

  const quickMove = async (task: MyTaskView, next: TaskStatus) => {
    if (task.status === next) return;
    setBanner(null);
    const prev = list.data ?? [];
    list.setData(prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
    try {
      await api.tasks.changeStatus(workspaceId!, task.id, { status: next });
    } catch (error) {
      list.setData(prev);
      setBanner(errorMessage(error));
    }
  };

  const total = (list.data ?? []).length;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <h1 className="text-display">My Work</h1>
        <p className="mt-1 text-sm text-secondary">
          Tasks assigned to you across{' '}
          <span className="font-medium text-primary">{activeWorkspace.name}</span>
          {total > 0 ? ` · ${total} open in view` : ''}.
        </p>
      </header>

      {selected ? (
        <TaskDetail
          task={selected}
          workspaceId={activeWorkspace.id}
          members={roster.data ?? []}
          candidates={(siblings.data ?? []).map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
          }))}
          canManage={activeWorkspace.role !== 'MEMBER'}
          canMove
          userId={session.user.id}
          onBack={() => setSelected(null)}
          onUpdated={replaceTask}
          onOpenTask={(taskId) => {
            const found = (siblings.data ?? []).find((t) => t.id === taskId);
            if (found) setSelected(found);
            else
              void api.tasks
                .get(activeWorkspace.id, taskId)
                .then(setSelected)
                .catch(() => undefined);
          }}
          onDeleted={() => {
            setSelected(null);
            void list.reload();
          }}
        />
      ) : (
        <>
          {banner ? (
            <Alert variant="error" title="Update failed">
              {banner}
            </Alert>
          ) : null}

          {list.loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : list.error ? (
            <Alert variant="error" title="Could not load your work">
              {list.error}
              <div className="mt-2">
                <Button size="sm" variant="secondary" onClick={() => void list.reload()}>
                  Retry
                </Button>
              </div>
            </Alert>
          ) : total === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Nothing assigned to you"
              description="Tasks assigned to you in projects you can access will appear here, grouped by what needs attention."
            />
          ) : (
            <div className="space-y-5">
              {LANES.map((lane) => {
                const items = grouped[lane.id];
                if (items.length === 0) return null;
                return (
                  <Card
                    key={lane.id}
                    title={lane.label}
                    description={lane.hint}
                    action={<Badge tone={laneTone(lane.id)}>{items.length}</Badge>}
                    bodyClassName="p-0"
                  >
                    <div className="divide-y divide-border-subtle">
                      {items.map((task) => (
                        <MyWorkRow
                          key={task.id}
                          task={task}
                          busy={false}
                          onOpen={() => setSelected(task)}
                          onMove={(next) => void quickMove(task, next)}
                        />
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function laneTone(id: Bucket): 'neutral' | 'info' | 'warning' | 'success' {
  if (id === 'overdue') return 'warning';
  if (id === 'inprogress') return 'info';
  if (id === 'completed') return 'success';
  return 'neutral';
}

function MyWorkRow({
  task,
  busy,
  onOpen,
  onMove,
}: {
  task: MyTaskView;
  busy: boolean;
  onOpen: () => void;
  onMove: (next: TaskStatus) => void;
}) {
  const due = taskDueLabel(task.dueDate, task.status);
  const Icon =
    task.status === 'DONE'
      ? CheckCircle2
      : due.overdue
        ? AlertTriangle
        : task.status === 'TODO'
          ? Clock3
          : CircleDot;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className="size-4 shrink-0 text-muted" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={onOpen}
          className="text-left text-sm text-primary hover:underline"
        >
          <span className="line-clamp-1">{task.title}</span>
        </button>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-2xs text-muted">
          <span className="font-mono">{task.project.projectKey}</span>
          <span className="truncate">· {task.project.name}</span>
          {task.blocked ? <Badge tone="warning">Blocked</Badge> : null}
        </div>
      </div>
      <Badge tone={taskPriorityTone(task.priority)}>{taskPriorityLabel(task.priority)}</Badge>
      <span
        className={
          due.overdue
            ? 'hidden w-24 text-right text-2xs text-danger sm:block'
            : 'hidden w-24 text-right text-2xs text-muted sm:block'
        }
      >
        {due.text}
      </span>
      <select
        aria-label={`Set status for ${task.title}`}
        className={CONTROL}
        value={task.status}
        disabled={busy}
        onChange={(e) => onMove(e.target.value as TaskStatus)}
      >
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {taskStatusLabel(s)}
          </option>
        ))}
      </select>
      <span className="hidden shrink-0 items-center gap-1.5 text-2xs text-secondary md:inline-flex">
        {task.assignee ? (
          <Avatar name={task.assignee.name} size="sm" />
        ) : (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        )}
      </span>
    </div>
  );
}
