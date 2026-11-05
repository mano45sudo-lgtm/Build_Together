import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CircleSlash, Link2, Trash2, Unlink } from 'lucide-react';
import type {
  MemberSummary,
  TaskActivityView,
  TaskPriority,
  TaskRef,
  TaskStatus,
  TaskView,
} from '@buildtogether/shared';
import { TASK_PRIORITIES, TASK_STATUSES } from '@buildtogether/shared';
import { Alert } from '../../components/ui/Alert';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { useResource } from '../../hooks/useResource';
import { errorMessage } from '../../lib/bridge';
import { api } from '../../lib/data';
import {
  formatTaskDate,
  taskActivityLabel,
  taskDueLabel,
  taskPriorityLabel,
  taskPriorityTone,
  taskStatusLabel,
  taskStatusTone,
} from './taskUtils';

const CONTROL =
  'h-9 w-full rounded-md border border-border-default bg-surface-2 px-3 text-sm text-primary focus-visible:border-accent focus-visible:outline-none disabled:opacity-50';

export interface TaskDetailProps {
  task: TaskView;
  workspaceId: string;
  members: MemberSummary[];
  /** Sibling tasks in this project offered as dependency candidates. */
  candidates: TaskRef[];
  canManage: boolean;
  /** Whether the caller may move this task's status (manager OR assignee/creator) — UI only. */
  canMove: boolean;
  userId: string;
  onBack: () => void;
  /** Propagate any change so the parent can update its list + selection. */
  onUpdated: (task: TaskView) => void;
  /** Navigate to a related (dependency / blocked-by) task by id. */
  onOpenTask: (taskId: string) => void;
  /** Called after a delete so the parent can leave the detail view. */
  onDeleted: () => void;
}

/**
 * Focused task detail: identity + inline editing of the workflow fields, dependencies (prerequisites and
 * dependents), and the activity history. Editing is optimistic where safe and always reconciled against
 * the server response; a failed write rolls back and surfaces recovery feedback (brief §5, §7).
 *
 * Dependency state is kept SEPARATE from workflow status (brief §7): completing a prerequisite never
 * auto-moves this task. `blocked` is derived server-side and only displayed here.
 */
export function TaskDetail({
  task,
  workspaceId,
  members,
  candidates,
  canManage,
  canMove,
  userId,
  onBack,
  onUpdated,
  onOpenTask,
  onDeleted,
}: TaskDetailProps) {
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const deps = useResource(
    () => api.tasks.dependencies(workspaceId, task.id),
    [workspaceId, task.id],
  );
  const activity = useResource(
    () => api.tasks.activity(workspaceId, task.id, { limit: 50 }),
    [workspaceId, task.id],
  );

  // Local edit buffers seed from the server task; a successful write replaces the whole task (authoritative).
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const due = taskDueLabel(task.dueDate, task.status);

  const assignable = useMemo(() => members, [members]);

  const run = async (key: string, op: () => Promise<TaskView>) => {
    setBusy(key);
    setBanner(null);
    try {
      onUpdated(await op());
    } catch (error) {
      setBanner(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const saveContent = () => {
    const patch: Record<string, unknown> = {};
    if (title.trim() && title.trim() !== task.title) patch.title = title.trim();
    if (description !== (task.description ?? '')) patch.description = description || null;
    if (Object.keys(patch).length === 0) return;
    void run('content', () =>
      api.tasks.update(workspaceId, task.id, patch as Parameters<typeof api.tasks.update>[2]),
    );
  };

  const changeStatus = (next: TaskStatus) => {
    if (next === task.status) return;
    void run('status', () => api.tasks.changeStatus(workspaceId, task.id, { status: next }));
  };

  const changePriority = (next: TaskPriority) => {
    if (next === task.priority) return;
    void run('priority', () => api.tasks.update(workspaceId, task.id, { priority: next }));
  };

  const changeAssignee = (next: string) => {
    if (next === (task.assignee?.id ?? '')) return;
    void run('assignee', () =>
      api.tasks.assign(workspaceId, task.id, { assigneeId: next === '' ? null : next }),
    );
  };

  const changeDue = (next: string) => {
    if (next === (task.dueDate?.slice(0, 10) ?? '')) return;
    void run('due', () => api.tasks.update(workspaceId, task.id, { dueDate: next || null }));
  };

  const addDependency = (dependsOnTaskId: string) => {
    if (!dependsOnTaskId) return;
    setBusy('dep');
    setBanner(null);
    void deps.reload().catch(() => undefined);
    api.tasks
      .addDependency(workspaceId, task.id, { dependsOnTaskId })
      .then(async () => {
        await deps.reload();
        await activity.reload();
        // Re-read the task so its derived `blocked` flag refreshes.
        onUpdated(await api.tasks.get(workspaceId, task.id));
      })
      .catch((error: unknown) => setBanner(errorMessage(error)))
      .finally(() => setBusy(null));
  };

  const removeDependency = (dependencyId: string) => {
    setBusy('dep');
    setBanner(null);
    api.tasks
      .removeDependency(workspaceId, task.id, dependencyId)
      .then(async () => {
        await deps.reload();
        await activity.reload();
        onUpdated(await api.tasks.get(workspaceId, task.id));
      })
      .catch((error: unknown) => setBanner(errorMessage(error)))
      .finally(() => setBusy(null));
  };

  const removeTask = () => {
    setBusy('delete');
    setBanner(null);
    api.tasks
      .remove(workspaceId, task.id)
      .then(() => onDeleted())
      .catch((error: unknown) => {
        setBanner(errorMessage(error));
        setBusy(null);
      });
  };

  // Which siblings can still be linked (not self, not already a prerequisite).
  const alreadyLinked = new Set((deps.data?.dependsOn ?? []).map((d) => d.task.id));
  const linkOptions = candidates.filter((c) => c.id !== task.id && !alreadyLinked.has(c.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to tasks
        </Button>
        {canManage ? (
          <Button variant="destructive" size="sm" onClick={removeTask} loading={busy === 'delete'}>
            {busy !== 'delete' ? <Trash2 className="size-3.5" aria-hidden="true" /> : null}
            Delete
          </Button>
        ) : null}
      </div>

      {banner ? (
        <Alert variant="error" title="Update failed">
          {banner}
        </Alert>
      ) : null}

      {task.blocked ? (
        <Alert variant="info" title="Blocked">
          This task is waiting on an unfinished prerequisite. Completing that task will not move
          this one automatically — change its status when you are ready.
        </Alert>
      ) : null}

      <Card
        title="Details"
        description="Edit inline. Changes save when the field loses focus or you choose."
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="td-title" className="block text-xs font-medium text-secondary">
              Title
            </label>
            <input
              id="td-title"
              className={CONTROL}
              value={title}
              disabled={!canManage}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveContent}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="td-desc" className="block text-xs font-medium text-secondary">
              Description
            </label>
            <textarea
              id="td-desc"
              className={CONTROL + ' h-24 resize-none py-2'}
              value={description}
              disabled={!canManage}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={saveContent}
              placeholder="Add detail"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="td-status" className="block text-xs font-medium text-secondary">
                Status
              </label>
              <select
                id="td-status"
                className={CONTROL}
                value={task.status}
                disabled={!canMove || busy === 'status'}
                onChange={(e) => changeStatus(e.target.value as TaskStatus)}
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {taskStatusLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="td-priority" className="block text-xs font-medium text-secondary">
                Priority
              </label>
              <select
                id="td-priority"
                className={CONTROL}
                value={task.priority}
                disabled={!canManage || busy === 'priority'}
                onChange={(e) => changePriority(e.target.value as TaskPriority)}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {taskPriorityLabel(p)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="td-assignee" className="block text-xs font-medium text-secondary">
                Assignee
              </label>
              <select
                id="td-assignee"
                className={CONTROL}
                value={task.assignee?.id ?? ''}
                disabled={!canManage || busy === 'assignee'}
                onChange={(e) => changeAssignee(e.target.value)}
              >
                <option value="">Unassigned</option>
                {assignable.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.userId === userId ? `${m.name} (me)` : m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="td-due" className="block text-xs font-medium text-secondary">
                Due date
              </label>
              <input
                id="td-due"
                type="date"
                className={CONTROL}
                value={task.dueDate?.slice(0, 10) ?? ''}
                disabled={!canManage || busy === 'due'}
                onChange={(e) => changeDue(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted">
            <Badge tone={taskStatusTone(task.status)}>{taskStatusLabel(task.status)}</Badge>
            <Badge tone={taskPriorityTone(task.priority)}>{taskPriorityLabel(task.priority)}</Badge>
            {due.overdue ? <Badge tone="danger">Overdue</Badge> : null}
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={task.createdBy.name} size="sm" />
              Created by {task.createdBy.name} · {formatTaskDate(task.createdAt)}
            </span>
          </div>
        </div>
      </Card>

      <Card title="Dependencies" description="What this task waits on, and what waits on it.">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-secondary">Blocked by</p>
            {deps.loading ? (
              <Skeleton className="h-8 w-full" />
            ) : (deps.data?.dependsOn.length ?? 0) === 0 ? (
              <p className="text-sm text-muted">No prerequisites. This task is not blocked.</p>
            ) : (
              <ul className="space-y-1">
                {deps.data?.dependsOn.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-2 px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenTask(d.task.id)}
                      className="flex min-w-0 items-center gap-2 text-left text-sm text-primary hover:underline"
                    >
                      <Badge tone={taskStatusTone(d.task.status)}>
                        {taskStatusLabel(d.task.status)}
                      </Badge>
                      <span className="truncate">{d.task.title}</span>
                    </button>
                    {canManage ? (
                      <IconButton
                        aria-label={`Remove dependency ${d.task.title}`}
                        onClick={() => removeDependency(d.id)}
                        disabled={busy === 'dep'}
                      >
                        <Unlink className="size-4" aria-hidden="true" />
                      </IconButton>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(deps.data?.blocks.length ?? 0) > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-secondary">Blocking</p>
              <ul className="space-y-1">
                {deps.data?.blocks.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => onOpenTask(b.id)}
                      className="flex w-full items-center gap-2 rounded-md border border-border-subtle bg-surface-2 px-3 py-2 text-left text-sm text-primary hover:bg-surface-3"
                    >
                      <Badge tone={taskStatusTone(b.status)}>{taskStatusLabel(b.status)}</Badge>
                      <span className="truncate">{b.title}</span>
                      <ArrowRight
                        className="ml-auto size-3.5 shrink-0 text-muted"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {canManage && linkOptions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
              <Link2 className="size-4 text-muted" aria-hidden="true" />
              <select
                aria-label="Add a prerequisite"
                className={CONTROL + ' max-w-xs'}
                value=""
                disabled={busy === 'dep'}
                onChange={(e) => addDependency(e.target.value)}
              >
                <option value="">Add prerequisite…</option>
                {linkOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      </Card>

      <Card title="Activity" description="The history of this task.">
        {activity.loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : activity.error ? (
          <Alert variant="error" title="Could not load activity">
            {activity.error}
          </Alert>
        ) : (activity.data?.length ?? 0) === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <CircleSlash className="size-4" aria-hidden="true" />
            No activity yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {activity.data?.map((a: TaskActivityView) => (
              <li key={a.id} className="flex items-start gap-3">
                <Avatar name={a.actor.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-primary">
                    <span className="font-medium">{a.actor.name}</span> · {a.message}
                  </p>
                  <p className="text-2xs text-muted">
                    {taskActivityLabel(a.type)}
                    {' · '}
                    {formatTaskDate(a.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
