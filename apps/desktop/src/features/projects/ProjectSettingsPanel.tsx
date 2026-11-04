import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Loader2 } from 'lucide-react';
import type { MemberSummary, ProjectView, UpdateProjectInput } from '@buildtogether/shared';
import { PROJECT_STATUSES, PROJECT_VISIBILITIES } from '@buildtogether/shared';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { Spinner } from '../../components/ui/Spinner';
import { errorMessage } from '../../lib/bridge';
import { api } from '../../lib/data';
import { projectStatusLabel, projectVisibilityLabel } from './projectUtils';

const CONTROL =
  'h-9 w-full rounded-md border border-border-default bg-surface-2 px-3 text-sm text-primary focus-visible:border-accent focus-visible:outline-none disabled:opacity-50';

/** ISO instant (or YYYY-MM-DD) → the `YYYY-MM-DD` value a date input expects ('' when null). */
function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export interface ProjectSettingsPanelProps {
  project: ProjectView;
  workspaceId: string;
  members: MemberSummary[];
  canManage: boolean;
  loadingMembers: boolean;
  onUpdated: (project: ProjectView) => void;
}

/**
 * Project settings: edit fields, change owner, and archive / restore. The controls are shown only when
 * the caller may manage the project (client mirror of the server rule); every mutation is re-authorized
 * server-side regardless. Archive/restore are behind explicit confirmations. Ownership is reassigned,
 * never removed — there is no ownerless state.
 */
export function ProjectSettingsPanel({
  project,
  workspaceId,
  members,
  canManage,
  loadingMembers,
  onUpdated,
}: ProjectSettingsPanelProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [status, setStatus] = useState(project.status);
  const [visibility, setVisibility] = useState(project.visibility);
  const [ownerId, setOwnerId] = useState(project.owner.id);
  const [icon, setIcon] = useState(project.icon ?? '');
  const [color, setColor] = useState(project.color ?? '');
  const [startDate, setStartDate] = useState(toDateInput(project.startDate));
  const [targetDate, setTargetDate] = useState(toDateInput(project.targetDate));

  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'archive' | 'restore' | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-sync local form when a different project (or an updated one) is handed in.
  useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? '');
    setStatus(project.status);
    setVisibility(project.visibility);
    setOwnerId(project.owner.id);
    setIcon(project.icon ?? '');
    setColor(project.color ?? '');
    setStartDate(toDateInput(project.startDate));
    setTargetDate(toDateInput(project.targetDate));
  }, [project]);

  if (!canManage) {
    return (
      <Card title="Project settings">
        <Alert variant="info" title="Read only">
          You can view this project, but only its owner, its creator, or a workspace admin can
          change its settings, owner, or archive state.
        </Alert>
      </Card>
    );
  }

  const patch = (): UpdateProjectInput => {
    const p: UpdateProjectInput = {};
    if (name.trim() && name.trim() !== project.name) p.name = name.trim();
    if (description.trim() !== (project.description ?? '')) p.description = description.trim();
    if (status !== project.status) p.status = status;
    if (visibility !== project.visibility) p.visibility = visibility;
    if (ownerId && ownerId !== project.owner.id) p.ownerId = ownerId;
    if (icon.trim() !== (project.icon ?? '')) p.icon = icon.trim();
    if (color.trim() !== (project.color ?? '')) p.color = color.trim();
    if (startDate !== toDateInput(project.startDate)) p.startDate = startDate || null;
    if (targetDate !== toDateInput(project.targetDate)) p.targetDate = targetDate || null;
    return p;
  };

  const dirty = Object.keys(patch()).length > 0;
  const nameValid = name.trim().length > 0;

  const save = async () => {
    if (saving || !dirty || !nameValid) return;
    setSaving(true);
    setBanner(null);
    try {
      onUpdated(await api.projects.update(workspaceId, project.id, patch()));
    } catch (error) {
      setBanner(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const runArchive = async () => {
    if (!confirm) return;
    setBusy(true);
    setBanner(null);
    try {
      const next =
        confirm === 'archive'
          ? await api.projects.archive(workspaceId, project.id)
          : await api.projects.restore(workspaceId, project.id);
      setConfirm(null);
      onUpdated(next);
    } catch (error) {
      setBanner(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card title="Details">
        <div className="space-y-4">
          {banner ? <Alert variant="error">{banner}</Alert> : null}
          <Field label="Project name" htmlFor="ps-name" required>
            <Input
              id="ps-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </Field>
          <Field label="Description" htmlFor="ps-desc">
            <Input
              id="ps-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status" htmlFor="ps-status">
              <select
                id="ps-status"
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
            <Field label="Visibility" htmlFor="ps-vis">
              <select
                id="ps-vis"
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
            <Field label="Start date" htmlFor="ps-start">
              <input
                id="ps-start"
                type="date"
                className={CONTROL}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="Target date" htmlFor="ps-target">
              <input
                id="ps-target"
                type="date"
                className={CONTROL}
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Icon" htmlFor="ps-icon" hint="Emoji or short marker">
              <Input
                id="ps-icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                maxLength={16}
              />
            </Field>
            <Field label="Color" htmlFor="ps-color" hint="Optional hex, e.g. #a1a1aa">
              <Input
                id="ps-color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                maxLength={24}
              />
            </Field>
          </div>

          <Field
            label="Owner"
            htmlFor="ps-owner"
            hint="The project always has one owner; ownership is reassigned, never removed."
          >
            <select
              id="ps-owner"
              className={CONTROL}
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              disabled={loadingMembers}
            >
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                  {m.userId === project.owner.id ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={saving || !dirty || !nameValid}>
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Save changes
            </Button>
          </div>
        </div>
      </Card>

      <Card
        title="Archive"
        description={
          project.archivedAt
            ? 'This project is archived. Restore it to make it active again.'
            : 'Archiving hides a project from the active list without deleting it.'
        }
      >
        {project.archivedAt ? (
          <Button variant="secondary" onClick={() => setConfirm('restore')}>
            <ArchiveRestore className="size-4" aria-hidden="true" />
            Restore project
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => setConfirm('archive')}>
            <Archive className="size-4" aria-hidden="true" />
            Archive project
          </Button>
        )}
      </Card>

      <Dialog
        open={confirm !== null}
        onClose={() => (busy ? undefined : setConfirm(null))}
        title={confirm === 'archive' ? 'Archive project' : 'Restore project'}
        description={
          confirm === 'archive'
            ? `"${project.name}" will move to the Archived list. Its history is kept and you can restore it later.`
            : `"${project.name}" will return to the active projects list.`
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void runArchive()} disabled={busy}>
            {busy ? <Spinner className="size-4" /> : null}
            {confirm === 'archive' ? 'Archive' : 'Restore'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
