import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { WorkspaceSummary } from '@buildtogether/shared';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { errorMessage } from '../../lib/bridge';
import { api } from '../../lib/data';

export interface CreateWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (workspace: WorkspaceSummary) => void;
}

/** Create a workspace; the creator becomes OWNER (assigned server-side, never client-supplied). */
export function CreateWorkspaceDialog({ open, onClose, onCreated }: CreateWorkspaceDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const reset = () => {
    setName('');
    setDescription('');
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
    if (submitting) return;
    setSubmitting(true);
    setBanner(null);
    setNameError(undefined);
    try {
      const created = await api.workspaces.create({
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
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
      title="New workspace"
      description="A home for one team and its work."
    >
      <form className="space-y-4" onSubmit={submit}>
        {banner ? <Alert variant="error">{banner}</Alert> : null}
        <Field label="Workspace name" htmlFor="ws-name" required error={nameError}>
          <Input
            id="ws-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Product Team"
            autoFocus
          />
        </Field>
        <Field label="Description" htmlFor="ws-desc" hint="Optional. What is this workspace for?">
          <Input
            id="ws-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Where the product crew plans and ships"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || name.trim().length === 0}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Create workspace
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
