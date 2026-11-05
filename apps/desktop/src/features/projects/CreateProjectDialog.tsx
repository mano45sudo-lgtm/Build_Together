import { useState } from 'react';
import type { CreateProjectInput, MemberSummary, ProjectView } from '@buildtogether/shared';
import { PROJECT_STATUSES, PROJECT_VISIBILITIES } from '@buildtogether/shared';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { errorMessage } from '../../lib/bridge';
import { api } from '../../lib/data';
import { canAssignProjectOwner } from '../../lib/rbac';
import { useResource } from '../../hooks/useResource';
import { projectStatusLabel, projectVisibilityLabel } from './projectUtils';

const CONTROL =
  'h-9 w-full rounded-md border border-border-default bg-surface-2 px-3 text-sm text-primary focus-visible:border-accent focus-visible:outline-none';

export interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  /** Current caller role — decides whether a different owner can be chosen at creation. */
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  onCreated: (project: ProjectView) => void;
}

/**
 * Concise project creation. Only the NAME is required; everything else is optional. The project key
 * and slug are generated + de-duplicated SERVER-side (never sent from here), and an owner other than
 * the caller is an OWNER/ADMIN-only choice that the server re-checks against workspace membership.
 */
export function CreateProjectDialog({
  open,
  onClose,
  workspaceId,
  role,
  onCreated,
}: CreateProjectDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectView['status']>('ACTIVE');
  const [visibility, setVisibility] = useState<ProjectView['visibility']>('WORKSPACE');
  const [icon, setIcon] = useState('');
  const [startDate, setStartDate] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [ownerId, setOwnerId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const mayAssignOwner = canAssignProjectOwner(role);
  const roster = useResource<MemberSummary[]>(
    () => (mayAssignOwner ? api.members.list(workspaceId) : Promise.resolve([])),
    [workspaceId, mayAssignOwner],
  );

  const reset = () => {
    setName('');
    setDescription('');
    setStatus('ACTIVE');
    setVisibility('WORKSPACE');
    setIcon('');
    setStartDate('');
    setTargetDate('');
    setOwnerId('');
    setBanner(null);
    setNameError(undefined);
  };

  const close = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || name.trim().length === 0) return;
    setSubmitting(true);
    setBanner(null);
    setNameError(undefined);
    const input: CreateProjectInput = { name: name.trim(), status, visibility };
    if (description.trim()) input.description = description.trim();
    if (icon.trim()) input.icon = icon.trim();
    if (startDate) input.startDate = startDate;
    if (targetDate) input.targetDate = targetDate;
    if (mayAssignOwner && ownerId) input.ownerId = ownerId;
    try {
      const created = await api.projects.create(workspaceId, input);
      reset();
      onCreated(created);
    } catch (error) {
      const details = (error as { details?: Record<string, string[]> }).details;
      setNameError(details?.['name']?.[0]);
      setBanner(errorMessage(error));
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New project"
      description="A project organizes work inside this workspace. Only the name is required."
    >
      <form className="space-y-4" onSubmit={submit}>
        {banner ? <Alert variant="error">{banner}</Alert> : null}
        <Field label="Project name" htmlFor="pj-name" required error={nameError}>
          <Input
            id="pj-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Website Relaunch"
            maxLength={80}
            autoFocus
          />
        </Field>

        <Field label="Description" htmlFor="pj-desc" hint="Optional. What is this project for?">
          <Input
            id="pj-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short purpose"
            maxLength={500}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Status" htmlFor="pj-status">
            <select
              id="pj-status"
              className={CONTROL}
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectView['status'])}
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {projectStatusLabel(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Visibility" htmlFor="pj-vis">
            <select
              id="pj-vis"
              className={CONTROL}
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as ProjectView['visibility'])}
            >
              {PROJECT_VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {projectVisibilityLabel(v)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date" htmlFor="pj-start" hint="Optional">
            <input
              id="pj-start"
              type="date"
              className={CONTROL}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field label="Target date" htmlFor="pj-target" hint="Optional">
            <input
              id="pj-target"
              type="date"
              className={CONTROL}
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Icon" htmlFor="pj-icon" hint="Optional. A single emoji or short marker.">
          <Input
            id="pj-icon"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="🚀"
            maxLength={16}
          />
        </Field>

        {mayAssignOwner ? (
          <Field
            label="Owner"
            htmlFor="pj-owner"
            hint="Optional. Defaults to you. Only an admin can assign another member."
          >
            <select
              id="pj-owner"
              className={CONTROL}
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              disabled={roster.loading}
            >
              <option value="">Me (creator)</option>
              {(roster.data ?? []).map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={name.trim().length === 0}>
            Create project
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
