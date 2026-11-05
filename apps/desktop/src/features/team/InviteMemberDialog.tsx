import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { CreatedInvitation, WorkspaceRole } from '@buildtogether/shared';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { Input } from '../../components/ui/Input';
import { errorMessage } from '../../lib/bridge';
import { api } from '../../lib/data';

const SELECT =
  'h-9 w-full rounded-md border border-border-default bg-surface-2 px-2 text-sm text-primary focus-visible:border-accent focus-visible:outline-none';

export interface InviteMemberDialogProps {
  open: boolean;
  workspaceId: string;
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Invite a teammate by email with a role. No email transport is configured in Phase 2, so the server
 * returns a development accept link; we surface it verbatim and label it honestly — the app NEVER
 * claims a message was sent.
 */
export function InviteMemberDialog({
  open,
  workspaceId,
  onClose,
  onCreated,
}: InviteMemberDialogProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('MEMBER');
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<CreatedInvitation | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setEmail('');
    setRole('MEMBER');
    setBanner(null);
    setEmailError(undefined);
    setResult(null);
    setCopied(false);
  };

  const close = () => {
    if (submitting) return;
    const hadResult = result !== null;
    reset();
    onClose();
    if (hadResult) onCreated();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setBanner(null);
    setEmailError(undefined);
    try {
      const created = await api.invitations.create(workspaceId, { email: email.trim(), role });
      setResult(created);
      setEmail('');
      onCreated();
    } catch (error) {
      const details = (error as { details?: Record<string, string[]> }).details;
      setEmailError(details?.['email']?.[0]);
      setBanner(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const copy = async () => {
    if (!result?.devInviteLink) return;
    try {
      await navigator.clipboard.writeText(result.devInviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setBanner('Copy failed — select the link and copy it manually.');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Invite a teammate"
      description="They join with the role you choose once they accept."
    >
      <form className="space-y-4" onSubmit={submit}>
        {banner ? <Alert variant="error">{banner}</Alert> : null}

        <Field label="Email" htmlFor="invite-email" required error={emailError}>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@studio.com"
            autoFocus
          />
        </Field>

        <Field
          label="Role"
          htmlFor="invite-role"
          hint="Owner is never assignable — ownership is transferred."
        >
          <select
            id="invite-role"
            className={SELECT}
            value={role}
            onChange={(e) => setRole(e.target.value as WorkspaceRole)}
          >
            <option value="MEMBER">MEMBER — view and participate</option>
            <option value="ADMIN">ADMIN — manage members and settings</option>
          </select>
        </Field>

        {result ? (
          result.devInviteLink ? (
            <Alert variant="info" title="Development invite link">
              <p className="mb-2">
                No email service is configured, so this link was <strong>not</strong> sent — share
                it with {result.invitation.email} yourself. It expires with the invitation.
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-surface-2 px-2 py-1 font-mono text-2xs text-secondary">
                  {result.devInviteLink}
                </code>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void copy()}
                  aria-label="Copy invite link"
                >
                  {copied ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : (
                    <Copy className="size-3.5" aria-hidden="true" />
                  )}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </Alert>
          ) : (
            <Alert variant="success" title="Invitation sent">
              An invitation for {result.invitation.email} ({result.invitation.role}) is on its way.
            </Alert>
          )
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={close} disabled={submitting}>
            {result ? 'Done' : 'Cancel'}
          </Button>
          <Button type="submit" loading={submitting} disabled={email.trim().length === 0}>
            Send invitation
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
