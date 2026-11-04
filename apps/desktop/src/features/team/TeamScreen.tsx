import { useAuth } from '../../state/AuthProvider';
import { MembersPanel } from './MembersPanel';
import { InvitationsPanel } from './InvitationsPanel';
import { NoWorkspace } from '../workspace/NoWorkspace';

/** Team & access management for the active workspace: members, roles, and invitations. */
export function TeamScreen() {
  const { activeWorkspace } = useAuth();
  if (!activeWorkspace) return <NoWorkspace />;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <h1 className="text-display">Members</h1>
        <p className="mt-1 text-sm text-secondary">
          Manage who is in <span className="font-medium text-primary">{activeWorkspace.name}</span>{' '}
          and what they can do. Roles you see here are enforced by the server on every action.
        </p>
      </div>
      <MembersPanel workspaceId={activeWorkspace.id} workspaceName={activeWorkspace.name} />
      <InvitationsPanel workspaceId={activeWorkspace.id} />
    </div>
  );
}
