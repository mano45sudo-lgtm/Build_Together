import { useState } from 'react';
import type {
  CreateTaskInput,
  MemberSummary,
  TaskPriority,
  TaskRef,
  TaskStatus,
  TaskView,
} from '@buildtogether/shared';
import { TASK_PRIORITIES, TASK_STATUSES } from '@buildtogether/shared';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { errorMessage } from '../../lib/bridge';
import { api } from '../../lib/data';
import { taskPriorityLabel, taskStatusLabel } from './taskUtils';

const CONTROL =
  'h-9 w-full rounded-md border border-border-default bg-surface-2 px-3 text-sm text-primary focus-visible:border-accent focus-visible:outline-none';

export interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  projectId: string;
  /** Workspace members — the only valid assignees (the server re-checks membership on create). */
  members: MemberSummary[];
  /** Existing tasks in this project, offered as prerequisites (dependencies). */
  candidateDependencies: TaskRef[];
  /** The authenticated user id, so the assignee list can label "me". */
  userId: string;
  onCreated: (task: TaskView) => void;
}

/**
 * Quick task creation inside a project. Only the TITLE is required — everything else is optional and
 * defaulted server-side (status TODO, priority MEDIUM). The project is fixed by the caller (a task is
 * always created within a project here). Assignee and dependency are chosen from real, already
 * authorized lists; the SERVER still re-validates membership, project scope and dependency legality.
 */
export function CreateTaskDialog({
  open,
  onClose,
  workspaceId,
  projectId,
  members,
  candidateDependencies,
  userId,
  onCreated,
}: CreateTaskDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('TODO');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dependencyId, setDependencyId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | undefined>(undefined);

  const reset = () => {
    setTitle('');
    setDescription('');
    setStatus('TODO');
    setPriority('MEDIUM');
    setAssigneeId('');
    setDueDate('');
    setDependencyId('');
    setBanner(null);
    setTitleError(undefined);
  };

  const close = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || title.trim().length === 0) return;
    setSubmitting(true);
    setBanner(null);
    setTitleError(undefined);
    const input: CreateTaskInput = { title: title.trim(), status, priority };
    if (description.trim()) input.description = description.trim();
    if (assigneeId) input.assigneeId = assigneeId;
    if (dueDate) input.dueDate = dueDate;
    if (dependencyId) input.dependencyIds = [dependencyId];
    try {
      const created = await api.tasks.create(workspaceId, projectId, input);
      reset();
      onCreated(created);
    } catch (error) {
      const details = (error as { details?: Record<string, string[]> }).details;
      setTitleError(details?.['title']?.[0]);
      setBanner(errorMessage(error));
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New task"
      description="Add work to this project. Only a title is required — the rest is optional."
    >
      <form className="space-y-4" onSubmit={submit}>
        {banner ? <Alert variant="error">{banner}</Alert> : null}

        <Field label="Title" htmlFor="tk-title" required error={titleError}>
          <Input
            id="tk-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Design the landing hero"
            maxLength={200}
            autoFocus
          />
        </Field>

        <Field label="Description" htmlFor="tk-desc" hint="Optional. What does done look like?">
          <textarea
            id="tk-desc"
            className={CONTROL + ' h-20 resize-none py-2'}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add detail (optional)"
            maxLength={2000}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Status" htmlFor="tk-status">
            <select
              id="tk-status"
              className={CONTROL}
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {taskStatusLabel(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority" htmlFor="tk-priority">
            <select
              id="tk-priority"
              className={CONTROL}
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {taskPriorityLabel(p)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Assignee"
            htmlFor="tk-assignee"
            hint="Optional. Must be a workspace member."
          >
            <select
              id="tk-assignee"
              className={CONTROL}
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.userId === userId ? `${m.name} (me)` : m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due date" htmlFor="tk-due" hint="Optional">
            <input
              id="tk-due"
              type="date"
              className={CONTROL}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
        </div>

        {candidateDependencies.length > 0 ? (
          <Field
            label="Blocked by"
            htmlFor="tk-dep"
            hint="Optional. This task will wait for another to finish first."
          >
            <select
              id="tk-dep"
              className={CONTROL}
              value={dependencyId}
              onChange={(e) => setDependencyId(e.target.value)}
            >
              <option value="">No dependency</option>
              {candidateDependencies.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={title.trim().length === 0}>
            Create task
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
