import { useState } from 'react';
import { MessageSquare, Plus, Users, Workflow } from 'lucide-react';
import type { WorkspaceSummary } from '@buildtogether/shared';
import { Badge, roleTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAuth } from '../../state/AuthProvider';
import { AcceptInviteCard } from '../invitations/AcceptInviteCard';
import { CreateWorkspaceDialog } from '../workspace/CreateWorkspaceDialog';
import { NoWorkspace } from '../workspace/NoWorkspace';

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/** Signed-in home: your identity, the active workspace at a glance, and ways to get people in. */
export function HomeScreen({ onOpenTeam }: { onOpenTeam: () => void }) {
  const { session, activeWorkspace, setActiveWorkspaceId, refresh } = useAuth();
  const [creating, setCreating] = useState(false);

  if (!session) return null;
  if (!activeWorkspace) return <NoWorkspace />;

  const onAccepted = (workspace: WorkspaceSummary) => {
    setActiveWorkspaceId(workspace.id);
    void refresh();
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <h1 className="text-display">Welcome back, {firstName(session.user.name)}</h1>
        <p className="mt-1 text-sm text-secondary">You are signed in as {session.user.email}.</p>
      </header>

      <Card
        title="Active workspace"
        action={<Badge tone={roleTone(activeWorkspace.role)}>{activeWorkspace.role}</Badge>}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-primary">{activeWorkspace.name}</p>
            <p className="mt-0.5 text-sm text-secondary">
              {activeWorkspace.memberCount}{' '}
              {activeWorkspace.memberCount === 1 ? 'member' : 'members'}
              {activeWorkspace.description ? ` · ${activeWorkspace.description}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onOpenTeam}>
              <Users className="size-3.5" aria-hidden="true" />
              Manage team
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" aria-hidden="true" />
              New workspace
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <AcceptInviteCard onAccepted={onAccepted} />
        <Card
          title="Coming in later phases"
          description="This space stays honest until those features ship."
        >
          <ul className="space-y-2 text-sm text-secondary">
            <li className="flex items-center gap-2">
              <Workflow className="size-4 text-muted" aria-hidden="true" /> Projects &amp; tasks
            </li>
            <li className="flex items-center gap-2">
              <MessageSquare className="size-4 text-muted" aria-hidden="true" /> Conversations &amp;
              channels
            </li>
          </ul>
        </Card>
      </div>

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
