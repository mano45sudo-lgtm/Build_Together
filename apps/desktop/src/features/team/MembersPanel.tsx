import { useState } from 'react';
import { AlertTriangle, ShieldCheck, UserMinus, Users } from 'lucide-react';
import type { MemberSummary, WorkspaceRole } from '@buildtogether/shared';
import { Alert } from '../../components/ui/Alert';
import { Avatar } from '../../components/ui/Avatar';
import { Badge, roleTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Dialog } from '../../components/ui/Dialog';
import { Dropdown } from '../../components/ui/Dropdown';
import { Skeleton } from '../../components/ui/Skeleton';
import { errorMessage } from '../../lib/bridge';
import { api } from '../../lib/data';
import { canChangeRole, canManageTeam, canRemove, canTransferTo } from '../../lib/rbac';
import { useResource } from '../../hooks/useResource';
import { useAuth } from '../../state/AuthProvider';
import { InviteMemberDialog } from './InviteMemberDialog';

const SELECT =
  'h-8 rounded-md border border-border-default bg-surface-2 px-2 text-xs text-primary focus-visible:border-accent focus-visible:outline-none';

type Pending = { kind: 'remove' | 'transfer'; member: MemberSummary } | null;

/** Members roster with server-authoritative role management (the UI only gates visibility). */
export function MembersPanel({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const { activeWorkspace, session, refresh } = useAuth();
  const actorRole = activeWorkspace?.role ?? 'MEMBER';
  const selfId = session?.user.id;

  const roster = useResource<MemberSummary[]>(() => api.members.list(workspaceId), [workspaceId]);
  const [inviting, setInviting] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const afterChange = async () => {
    await roster.reload();
    await refresh();
  };

  const changeRole = async (member: MemberSummary, role: WorkspaceRole) => {
    setActionError(null);
    try {
      await api.members.updateRole(workspaceId, member.userId, role);
      await afterChange();
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };

  const runPending = async () => {
    if (!pending) return;
    const { kind, member } = pending;
    const isSelf = member.userId === selfId;
    setBusy(true);
    setActionError(null);
    try {
      if (kind === 'transfer') {
        await api.members.transfer(workspaceId, member.userId);
        setPending(null);
        await refresh();
        await roster.reload();
      } else {
        await api.members.remove(workspaceId, member.userId);
        setPending(null);
        // Leaving ourselves: the session refresh drops the workspace, so don't re-read its roster.
        if (isSelf) await refresh();
        else await afterChange();
      }
    } catch (error) {
      setActionError(errorMessage(error));
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  const members = roster.data ?? [];

  return (
    <Card
      title="Members"
      description={
        members.length
          ? `${members.length} ${members.length === 1 ? 'person' : 'people'} with access to this workspace.`
          : 'People who can access this workspace.'
      }
      action={
        canManageTeam(actorRole) ? (
          <Button size="sm" onClick={() => setInviting(true)}>
            Invite
          </Button>
        ) : null
      }
    >
      {roster.loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : roster.error ? (
        <Alert variant="error" title="Could not load members">
          {roster.error}
          <div className="mt-2">
            <Button size="sm" variant="secondary" onClick={() => void roster.reload()}>
              Retry
            </Button>
          </div>
        </Alert>
      ) : (
        <div className="space-y-1">
          {actionError ? (
            <Alert variant="error" className="mb-2">
              {actionError}
            </Alert>
          ) : null}
          <ul className="divide-y divide-border-subtle">
            {members.map((member) => {
              const isSelf = member.userId === selfId;
              const manageable = canChangeRole(actorRole, member.role, isSelf);
              const menuItems: Array<{
                id: string;
                label: string;
                icon: typeof Users;
                onSelect: () => void;
              }> = [];
              if (canTransferTo(actorRole, member.role)) {
                menuItems.push({
                  id: 'transfer',
                  label: 'Transfer ownership',
                  icon: ShieldCheck,
                  onSelect: () => setPending({ kind: 'transfer', member }),
                });
              }
              if (canRemove(actorRole, member.role, isSelf)) {
                menuItems.push({
                  id: 'remove',
                  label: isSelf ? 'Leave workspace' : 'Remove member',
                  icon: UserMinus,
                  onSelect: () => setPending({ kind: 'remove', member }),
                });
              }
              return (
                <li key={member.userId} className="flex items-center gap-3 py-2.5">
                  <Avatar name={member.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-primary">{member.name}</p>
                      {isSelf ? <span className="text-2xs text-muted">You</span> : null}
                    </div>
                    <p className="truncate text-xs text-muted">{member.email}</p>
                  </div>
                  {manageable ? (
                    <select
                      aria-label={`Role for ${member.name}`}
                      className={SELECT}
                      value={member.role}
                      onChange={(e) => void changeRole(member, e.target.value as WorkspaceRole)}
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="MEMBER">MEMBER</option>
                    </select>
                  ) : (
                    <Badge tone={roleTone(member.role)}>{member.role}</Badge>
                  )}
                  {menuItems.length > 0 ? (
                    <Dropdown
                      triggerLabel={`Actions for ${member.name}`}
                      align="end"
                      trigger={
                        <span className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2">
                          <Users className="size-4" aria-hidden="true" />
                        </span>
                      }
                      items={menuItems}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <InviteMemberDialog
        open={inviting}
        workspaceId={workspaceId}
        onClose={() => setInviting(false)}
        onCreated={() => {
          setInviting(false);
          void afterChange();
        }}
      />

      <Dialog
        open={pending !== null}
        onClose={() => (busy ? undefined : setPending(null))}
        title={
          pending?.kind === 'transfer'
            ? 'Transfer ownership'
            : pending?.member.userId === selfId
              ? 'Leave workspace'
              : 'Remove member'
        }
        description={
          pending?.kind === 'transfer'
            ? `You will become an ADMIN and ${pending.member.name} becomes the OWNER. This cannot be undone from here.`
            : pending?.member.userId === selfId
              ? 'You will lose access to this workspace.'
              : `${pending?.member.name ?? ''} will lose access to this workspace.`
        }
      >
        <div className="flex items-start gap-2.5 rounded-md border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-secondary">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <p>
            {pending?.kind === 'transfer'
              ? 'Ownership is how a workspace stays accountable. Make sure this is who you want in charge.'
              : 'This action takes effect immediately.'}
          </p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={pending?.kind === 'transfer' ? 'primary' : 'destructive'}
            onClick={() => void runPending()}
            loading={busy}
          >
            {pending?.kind === 'transfer'
              ? `Transfer to ${pending?.member.name ?? ''}`
              : pending?.member.userId === selfId
                ? 'Leave'
                : `Remove from ${workspaceName}`}
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}
