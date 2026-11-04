import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, List as ListIcon, Plus, Search } from 'lucide-react';
import type {
  MemberSummary,
  TaskPriority,
  TaskRef,
  TaskStatus,
  TaskView,
} from '@buildtogether/shared';
import { TASK_PRIORITIES, TASK_STATUSES } from '@buildtogether/shared';
import { Alert } from '../../components/ui/Alert';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { useResource } from '../../hooks/useResource';
import { errorMessage } from '../../lib/bridge';
import { api } from '../../lib/data';
import { CreateTaskDialog } from './CreateTaskDialog';
import { TaskDetail } from './TaskDetail';
import {
  TASK_BOARD_COLUMNS,
  taskDueLabel,
  taskPriorityLabel,
  taskPriorityTone,
  taskStatusLabel,
  taskStatusTone,
} from './taskUtils';

const CONTROL =
  'h-9 rounded-md border border-border-default bg-surface-2 px-3 text-sm text-primary focus-visible:border-accent focus-visible:outline-none';

export interface TasksPanelProps {
  workspaceId: string;
  projectId: string;
  members: MemberSummary[];
  userId: string;
  /** Whether the caller manages this project (mirrors `canManageProject`) — hides controls only. */
  canManage: boolean;
  loadingMembers: boolean;
}

/** Can this caller move a task's workflow status? Manager OR the assignee OR the creator (UI mirror of the server rule). */
function canMoveTask(task: TaskView, ctx: { canManage: boolean; userId: string }): boolean {
  return ctx.canManage || task.assignee?.id === ctx.userId || task.createdBy.id === ctx.userId;
}

/**
 * The Tasks section inside a project workspace (brief §5). A toolbar (search + status/priority/assignee
 * filters + list/board toggle + quick create) drives two views of the same server-backed task set, and a
 * focused detail view. All filtering/sorting is applied SERVER-side via the list query; the renderer only
 * passes a query DTO. Kanban moves persist through the status endpoint with optimistic update and rollback
 * on failure — no drag-and-drop (kept reliable + accessible per brief).
 */
export function TasksPanel({
  workspaceId,
  projectId,
  members,
  userId,
  canManage,
  loadingMembers,
}: TasksPanelProps) {
  const [view, setView] = useState<'list' | 'board'>('list');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [assigneeId, setAssigneeId] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<TaskView | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  // Debounce typing so a keystroke does not fire a request.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const query = useMemo(
    () => ({
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(assigneeId ? { assigneeId } : {}),
      ...(search ? { search } : {}),
      sort: 'updatedAt' as const,
      dir: 'desc' as const,
      limit: 100,
    }),
    [status, priority, assigneeId, search],
  );

  const list = useResource<TaskView[]>(
    () => api.tasks.list(workspaceId, projectId, query),
    [workspaceId, projectId, query],
  );

  const tasks = useMemo(() => list.data ?? [], [list.data]);
  const candidates = useMemo<TaskRef[]>(
    () => tasks.map((t) => ({ id: t.id, title: t.title, status: t.status })),
    [tasks],
  );

  const replaceTask = (next: TaskView) => {
    list.setData((list.data ?? []).map((t) => (t.id === next.id ? next : t)));
    setSelected((cur) => (cur && cur.id === next.id ? next : cur));
  };

  const moveStatus = async (task: TaskView, next: TaskStatus) => {
    if (task.status === next) return;
    setBanner(null);
    const prev = tasks;
    // Optimistic: reorder into the target column immediately.
    list.setData(prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)));
    try {
      const updated = await api.tasks.changeStatus(workspaceId, task.id, { status: next });
      replaceTask(updated);
    } catch (error) {
      list.setData(prev); // rollback
      setBanner(errorMessage(error));
    }
  };

  const onOpenTask = (taskId: string) => {
    const found = tasks.find((t) => t.id === taskId);
    if (found) setSelected(found);
    else
      void api.tasks
        .get(workspaceId, taskId)
        .then(setSelected)
        .catch(() => undefined);
  };

  if (selected) {
    return (
      <TaskDetail
        task={selected}
        workspaceId={workspaceId}
        members={members}
        candidates={candidates}
        canManage={canManage}
        canMove={canMoveTask(selected, { canManage, userId })}
        userId={userId}
        onBack={() => setSelected(null)}
        onUpdated={replaceTask}
        onOpenTask={onOpenTask}
        onDeleted={() => {
          setSelected(null);
          void list.reload();
        }}
      />
    );
  }

  const filtersActive = search.length > 0 || status !== '' || priority !== '' || assigneeId !== '';

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              aria-label="Search tasks"
              className="w-48 pl-8"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search tasks…"
            />
          </div>
          <select
            aria-label="Filter by status"
            className={CONTROL}
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus | '')}
          >
            <option value="">All statuses</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {taskStatusLabel(s)}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by priority"
            className={CONTROL}
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority | '')}
          >
            <option value="">All priorities</option>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {taskPriorityLabel(p)}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by assignee"
            className={CONTROL}
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            <option value="">Anyone</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.userId === userId ? `${m.name} (me)` : m.name}
              </option>
            ))}
          </select>
          {filtersActive ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchInput('');
                setStatus('');
                setPriority('');
                setAssigneeId('');
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <div
            role="tablist"
            aria-label="Task view"
            className="inline-flex rounded-lg border border-border-default bg-surface-1 p-0.5"
          >
            <button
              role="tab"
              type="button"
              aria-selected={view === 'list'}
              onClick={() => setView('list')}
              className={
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ' +
                (view === 'list'
                  ? 'bg-surface-3 text-primary'
                  : 'text-secondary hover:text-primary')
              }
            >
              <ListIcon className="size-4" aria-hidden="true" />
              List
            </button>
            <button
              role="tab"
              type="button"
              aria-selected={view === 'board'}
              onClick={() => setView('board')}
              className={
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ' +
                (view === 'board'
                  ? 'bg-surface-3 text-primary'
                  : 'text-secondary hover:text-primary')
              }
            >
              <LayoutGrid className="size-4" aria-hidden="true" />
              Board
            </button>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden="true" />
            New task
          </Button>
        </div>
      </header>

      {banner ? (
        <Alert variant="error" title="Update failed">
          {banner}
        </Alert>
      ) : null}

      {list.loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : list.error ? (
        <Alert variant="error" title="Could not load tasks">
          {list.error}
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={() => void list.reload()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={ListIcon}
          title={filtersActive ? 'No tasks match your filters' : 'No tasks yet'}
          description={
            filtersActive
              ? 'Try clearing a filter or searching for something else.'
              : 'Create the first task to turn this project plan into assigned, trackable work.'
          }
          action={
            filtersActive ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearchInput('');
                  setStatus('');
                  setPriority('');
                  setAssigneeId('');
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus className="size-4" aria-hidden="true" />
                New task
              </Button>
            )
          }
        />
      ) : view === 'list' ? (
        <TaskListView tasks={tasks} onSelect={setSelected} />
      ) : (
        <TaskBoardView
          tasks={tasks}
          canManage={canManage}
          userId={userId}
          onSelect={setSelected}
          onMove={moveStatus}
        />
      )}

      <CreateTaskDialog
        open={creating}
        onClose={() => setCreating(false)}
        workspaceId={workspaceId}
        projectId={projectId}
        members={members}
        candidateDependencies={candidates}
        userId={userId}
        onCreated={(task) => {
          setCreating(false);
          void list.reload();
          setSelected(task);
        }}
      />
      {loadingMembers ? <p className="text-2xs text-muted">Loading members…</p> : null}
    </div>
  );
}

// ---- list view ----

function TaskListView({ tasks, onSelect }: { tasks: TaskView[]; onSelect: (t: TaskView) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border-default bg-surface-1">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-2xs uppercase tracking-wide text-muted">
            <th className="px-4 py-2.5 font-medium">Task</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Priority</th>
            <th className="px-4 py-2.5 font-medium">Assignee</th>
            <th className="px-4 py-2.5 text-right font-medium">Due</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {tasks.map((task) => {
            const due = taskDueLabel(task.dueDate, task.status);
            return (
              <tr
                key={task.id}
                tabIndex={0}
                role="button"
                onClick={() => onSelect(task)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(task);
                  }
                }}
                className="cursor-pointer transition-colors hover:bg-surface-2 focus-visible:bg-surface-2"
              >
                <td className="max-w-[280px] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-primary">{task.title}</span>
                    {task.blocked ? <Badge tone="warning">Blocked</Badge> : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={taskStatusTone(task.status)}>{taskStatusLabel(task.status)}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={taskPriorityTone(task.priority)}>
                    {taskPriorityLabel(task.priority)}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {task.assignee ? (
                    <span className="inline-flex items-center gap-2 text-secondary">
                      <Avatar name={task.assignee.name} size="sm" />
                      <span className="truncate">{task.assignee.name}</span>
                    </span>
                  ) : (
                    <span className="text-muted">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={due.overdue ? 'text-danger' : 'text-secondary'}>{due.text}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---- board view ----

function TaskBoardView({
  tasks,
  canManage,
  userId,
  onSelect,
  onMove,
}: {
  tasks: TaskView[];
  canManage: boolean;
  userId: string;
  onSelect: (t: TaskView) => void;
  onMove: (t: TaskView, next: TaskStatus) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {TASK_BOARD_COLUMNS.map((column) => {
        const items = tasks.filter((t) => t.status === column);
        return (
          <div
            key={column}
            className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface-1 p-2.5"
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-primary">{taskStatusLabel(column)}</span>
              <span className="font-mono text-2xs text-muted">{items.length}</span>
            </div>
            {items.length === 0 ? (
              <p className="px-1 py-4 text-center text-2xs text-muted">Empty</p>
            ) : (
              items.map((task) => {
                const due = taskDueLabel(task.dueDate, task.status);
                return (
                  <div
                    key={task.id}
                    className="flex flex-col gap-2 rounded-lg border border-border-default bg-surface-2 p-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(task)}
                      className="text-left text-sm text-primary hover:underline"
                    >
                      <span className="line-clamp-2">{task.title}</span>
                    </button>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={taskPriorityTone(task.priority)}>
                        {taskPriorityLabel(task.priority)}
                      </Badge>
                      {task.blocked ? <Badge tone="warning">Blocked</Badge> : null}
                      {due.overdue ? <Badge tone="danger">Overdue</Badge> : null}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      {task.assignee ? (
                        <span className="inline-flex min-w-0 items-center gap-1.5 text-2xs text-secondary">
                          <Avatar name={task.assignee.name} size="sm" />
                          <span className="truncate">{task.assignee.name}</span>
                        </span>
                      ) : (
                        <span className="text-2xs text-muted">Unassigned</span>
                      )}
                      <span
                        className={due.overdue ? 'text-2xs text-danger' : 'text-2xs text-muted'}
                      >
                        {due.text}
                      </span>
                    </div>
                    {canMoveTask(task, { canManage, userId }) ? (
                      <select
                        aria-label={`Move ${task.title}`}
                        className={CONTROL + ' h-7 text-2xs'}
                        value={task.status}
                        onChange={(e) => onMove(task, e.target.value as TaskStatus)}
                      >
                        {TASK_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {taskStatusLabel(s)}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}
