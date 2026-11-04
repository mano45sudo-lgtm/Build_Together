import { useState } from 'react';
import { Loader2, Ticket } from 'lucide-react';
import type { InvitationSummary, WorkspaceSummary } from '@buildtogether/shared';
import { Alert } from '../../components/ui/Alert';
import { Badge, roleTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { errorMessage } from '../../lib/bridge';
import { api } from '../../lib/data';
import { parseInviteToken } from '../../lib/rbac';
import { useResource } from '../../hooks/useResource';

/**
 * Accept an invitation. The invitee pastes the accept link (or token) they received — acceptance is
 * proven by that token AND the signed-in user's email matching, both checked server-side. Pending
 * invitations addressed to this account are listed as a hint, but the token is required to join
 * (it is never returned in the list, by design).
 */
export function AcceptInviteCard({
  onAccepted,
}: {
  onAccepted: (workspace: WorkspaceSummary) => void;
}) {
  const pending = useResource<InvitationSummary[]>(() => api.invitations.pendingForMe(), []);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = parseInviteToken(link);
    if (!token) {
      setError('Paste the full invitation link (or the token) from your email.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const workspace = await api.invitations.accept({ token });
      setLink('');
      onAccepted(workspace);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const items = pending.data ?? [];

  return (
    <Card title="Have an invitation?" description="Join a workspace a teammate invited you to.">
      {items.length > 0 ? (
        <div className="mb-4 space-y-2">
          <p className="text-xs font-medium text-secondary">Invitations waiting on your account:</p>
          <ul className="space-y-1.5">
            {items.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-2 px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm text-primary">{inv.email}</span>
                <Badge tone={roleTone(inv.role)}>{inv.role}</Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form className="space-y-3" onSubmit={accept}>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <Input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Paste invitation link or token"
          aria-label="Invitation link or token"
        />
        <Button type="submit" className="w-full" disabled={busy || link.trim().length === 0}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Ticket className="size-4" aria-hidden="true" />
          )}
          Accept invitation
        </Button>
      </form>
    </Card>
  );
}
