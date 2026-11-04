import { useState } from 'react';
import { MailX } from 'lucide-react';
import type { InvitationSummary } from '@buildtogether/shared';
import { Alert } from '../../components/ui/Alert';
import { Badge, invitationTone, roleTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { errorMessage } from '../../lib/bridge';
import { api } from '../../lib/data';
import { useResource } from '../../hooks/useResource';

/** Outstanding invitations for a workspace (ADMIN/OWNER view). Revoking is server-authorized. */
export function InvitationsPanel({ workspaceId }: { workspaceId: string }) {
  const list = useResource<InvitationSummary[]>(
    () => api.invitations.list(workspaceId),
    [workspaceId],
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const revoke = async (invitationId: string) => {
    setBusyId(invitationId);
    setError(null);
    try {
      await api.invitations.revoke(workspaceId, invitationId);
      await list.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const pending = (list.data ?? []).filter((i) => i.status === 'PENDING');

  return (
    <Card title="Pending invitations" description="People invited but not yet joined.">
      {list.loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : list.error ? (
        <Alert variant="error" title="Could not load invitations">
          {list.error}
        </Alert>
      ) : error ? (
        <Alert variant="error">{error}</Alert>
      ) : pending.length === 0 ? (
        <EmptyState
          icon={MailX}
          title="No pending invitations"
          description="Invite a teammate above and their link will appear here until they accept."
        />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {pending.map((inv) => (
            <li key={inv.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-primary">{inv.email}</p>
                <p className="truncate text-xs text-muted">
                  Invited by {inv.invitedBy} · expires{' '}
                  {new Date(inv.expiresAt).toLocaleDateString()}
                </p>
              </div>
              <Badge tone={roleTone(inv.role)}>{inv.role}</Badge>
              <Badge tone={invitationTone(inv.status)}>{inv.status}</Badge>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void revoke(inv.id)}
                disabled={busyId === inv.id}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
