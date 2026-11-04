import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAuth } from '../../state/AuthProvider';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';
import { AcceptInviteCard } from '../invitations/AcceptInviteCard';

/**
 * First-run onboarding: a signed-in identity with no workspace yet. Two honest paths — create a
 * workspace you own, or accept an invitation someone already sent you.
 */
export function NoWorkspace() {
  const { setActiveWorkspaceId, refresh } = useAuth();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5 md:grid-cols-2">
      <Card
        title="Create a workspace"
        description="A workspace is where your team's projects, people and decisions live."
      >
        <p className="mb-4 text-sm text-secondary">
          You will be its owner. You can invite teammates next.
        </p>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden="true" />
          New workspace
        </Button>
      </Card>

      <AcceptInviteCard
        onAccepted={(workspace) => {
          setActiveWorkspaceId(workspace.id);
          void refresh();
        }}
      />

      <CreateWorkspaceDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(created) => {
          setCreating(false);
          setActiveWorkspaceId(created.id);
          void refresh();
        }}
      />
    </div>
  );
}
