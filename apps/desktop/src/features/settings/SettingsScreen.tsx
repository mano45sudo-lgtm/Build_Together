import { useEffect, useState } from 'react';
import { KeyRound, LogOut, Save } from 'lucide-react';
import { Alert } from '../../components/ui/Alert';
import { Avatar } from '../../components/ui/Avatar';
import { Badge, roleTone } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { errorMessage } from '../../lib/bridge';
import { api } from '../../lib/data';
import { canManageTeam } from '../../lib/rbac';
import { useAuth } from '../../state/AuthProvider';

/** Account, security, and (role-gated) workspace settings. */
export function SettingsScreen() {
  const { session, activeWorkspace, signOut } = useAuth();
  if (!session) return null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <header>
        <h1 className="text-display">Settings</h1>
        <p className="mt-1 text-sm text-secondary">
          Your profile, security, and workspace preferences.
        </p>
      </header>

      <ProfileCard key={session.user.id} />
      <SecurityCard />
      {activeWorkspace ? <WorkspaceCard key={activeWorkspace.id} /> : null}

      <Card title="Session">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-secondary">
            Signed in as <span className="font-medium text-primary">{session.user.email}</span>.
            Signing out ends this desktop session on the server.
          </p>
          <Button variant="secondary" onClick={() => void signOut()}>
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ---- Profile ----

function ProfileCard() {
  const { session, refresh } = useAuth();
  const user = session!.user;
  const [name, setName] = useState(user.name);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = name !== user.name || avatarUrl !== (user.avatarUrl ?? '');

  const save = async () => {
    setBusy(true);
    setBanner(null);
    setSaved(false);
    try {
      await api.users.updateMe({
        name: name.trim(),
        avatarUrl: avatarUrl.trim() ? avatarUrl.trim() : null,
      });
      await refresh();
      setSaved(true);
    } catch (error) {
      setBanner(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Profile" description="How you appear to your team.">
      <div className="space-y-4">
        {banner ? <Alert variant="error">{banner}</Alert> : null}
        {saved ? <Alert variant="success">Profile updated.</Alert> : null}

        <div className="flex items-center gap-3">
          <Avatar name={name || user.name} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-primary">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
        </div>

        <Field label="Display name" htmlFor="profile-name">
          <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Avatar URL" htmlFor="profile-avatar" hint="Optional. A link to an image.">
          <Input
            id="profile-avatar"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…/me.png"
          />
        </Field>

        <div className="flex justify-end">
          <Button onClick={() => void save()} loading={busy} disabled={!dirty}>
            {!busy ? <Save className="size-4" aria-hidden="true" /> : null}
            Save changes
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---- Security ----

function SecurityCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setBanner(null);
    setSaved(false);
    try {
      await api.auth.changePassword({ currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setSaved(true);
    } catch (error) {
      setBanner(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Security" description="Changing your password signs out your other devices.">
      <form className="space-y-4" onSubmit={submit}>
        {banner ? <Alert variant="error">{banner}</Alert> : null}
        {saved ? (
          <Alert variant="success">Password changed. Other sessions were signed out.</Alert>
        ) : null}

        <Field label="Current password" htmlFor="pw-current" required>
          <Input
            id="pw-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field
          label="New password"
          htmlFor="pw-new"
          required
          hint="At least 10 characters."
          error={undefined}
        >
          <Input
            id="pw-new"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>

        <div className="flex justify-end">
          <Button type="submit" loading={busy} disabled={current.length === 0 || next.length === 0}>
            {!busy ? <KeyRound className="size-4" aria-hidden="true" /> : null}
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---- Workspace ----

function WorkspaceCard() {
  const { activeWorkspace, refresh } = useAuth();
  const ws = activeWorkspace!;
  const editable = canManageTeam(ws.role);

  const [name, setName] = useState(ws.name);
  const [description, setDescription] = useState(ws.description ?? '');
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-sync if the active workspace object changes underneath us (e.g. after a refresh).
  useEffect(() => {
    setName(ws.name);
    setDescription(ws.description ?? '');
  }, [ws.id, ws.name, ws.description]);

  const dirty = name !== ws.name || description !== (ws.description ?? '');

  const save = async () => {
    setBusy(true);
    setBanner(null);
    setSaved(false);
    try {
      await api.workspaces.update(ws.id, {
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
      });
      await refresh();
      setSaved(true);
    } catch (error) {
      setBanner(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Workspace"
      description="Details for this workspace."
      action={<Badge tone={roleTone(ws.role)}>{ws.role}</Badge>}
    >
      <div className="space-y-4">
        {banner ? <Alert variant="error">{banner}</Alert> : null}
        {saved ? <Alert variant="success">Workspace updated.</Alert> : null}
        {!editable ? (
          <Alert variant="info">
            Only owners and admins can edit workspace details. You have view access.
          </Alert>
        ) : null}

        <Field label="Workspace name" htmlFor="ws-settings-name">
          <Input
            id="ws-settings-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!editable}
          />
        </Field>
        <Field label="Description" htmlFor="ws-settings-desc">
          <Input
            id="ws-settings-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!editable}
            placeholder="What this workspace is for"
          />
        </Field>

        <div className="flex justify-end">
          <Button onClick={() => void save()} loading={busy} disabled={!editable || !dirty}>
            {!busy ? <Save className="size-4" aria-hidden="true" /> : null}
            Save changes
          </Button>
        </div>
      </div>
    </Card>
  );
}
