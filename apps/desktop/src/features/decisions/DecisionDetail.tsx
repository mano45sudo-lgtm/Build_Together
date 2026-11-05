import { useMemo, useState } from 'react';
import {
  Archive,
  Check,
  Link2,
  Loader2,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  Undo2,
  Users,
  X,
} from 'lucide-react';
import type {
  DecisionAlternativeInput,
  DecisionAlternativeView,
  DecisionCategory,
  DecisionCommentView,
  DecisionDetailView,
  DecisionHistoryView,
  DecisionReferenceInput,
  DecisionReferenceType,
  DecisionReferenceView,
  DecisionView,
  MemberSummary,
  UpdateDecisionInput,
} from '@buildtogether/shared';
import { DECISION_CATEGORIES } from '@buildtogether/shared';
import { Alert } from '../../components/ui/Alert';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { useResource } from '../../hooks/useResource';
import { errorMessage } from '../../lib/bridge';
import { api } from '../../lib/data';
import {
  canApprove,
  canArchive,
  canPropose,
  canReject,
  canRestore,
  canSupersede,
  canWithdrawToDraft,
  decisionCategoryLabel,
  decisionHistoryLabel,
  decisionIsEditable,
  decisionReferenceLabel,
  decisionStatusLabel,
  decisionStatusTone,
  formatDecisionDate,
} from './decisionUtils';

const CONTROL =
  'h-9 w-full rounded-md border border-border-default bg-surface-2 px-3 text-sm text-primary focus-visible:border-accent focus-visible:outline-none disabled:opacity-50';
const AREA = CONTROL + ' h-16 resize-none py-2 leading-relaxed';

export interface DecisionDetailProps {
  decision: DecisionDetailView;
  workspaceId: string;
  /** Workspace members — the only valid owners / participants (the server re-checks on every write). */
  members: MemberSummary[];
  /** Other live decisions this one could be superseded by, or referenced. */
  candidates: DecisionView[];
  /** Whether the caller manages this decision (mirror of `decision.service`; UI visibility only). */
  canManage: boolean;
  userId: string;
  onBack: () => void;
  /** Propagate any change so the vault updates its list + selection. */
  onUpdated: (decision: DecisionDetailView) => void;
  /** Open another decision by id (supersede target / decision reference). */
  onOpenDecision: (decisionId: string) => void;
  /** Called after a delete so the vault can leave the detail view. */
  onDeleted: () => void;
}

/**
 * A single decision's detail: identity + the full reasoning record (background, the decision statement,
 * rationale, consequences), the considered alternatives and cited references, the participant roster,
 * the lifecycle controls that move the closed state machine, the history timeline and a discussion.
 *
 * Everything here mirrors the server (`decision.service`): lifecycle buttons appear only for legal
 * transitions, editing is disabled once a decision is superseded or archived, and approving is gated on
 * a non-empty decision statement — but the SERVER re-derives the caller's role and re-validates every
 * write, so this panel never grants access, only reflects it. Saves are optimistic-then-reconciled: the
 * authoritative response replaces the whole record and any failed write rolls back with recovery
 * feedback (frontend-engineering / testing-qa).
 */
export function DecisionDetail({
  decision,
  workspaceId,
  members,
  candidates,
  canManage,
  userId,
  onBack,
  onUpdated,
  onOpenDecision,
  onDeleted,
}: DecisionDetailProps) {
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const editable = decisionIsEditable(decision.status);
  const canEdit = canManage && editable;

  const history = useResource<DecisionHistoryView[]>(
    () => api.decisions.history(workspaceId, decision.id, { limit: 50 }),
    [workspaceId, decision.id],
  );
  const comments = useResource<DecisionCommentView[]>(
    () => api.decisions.listComments(workspaceId, decision.id, { limit: 50 }),
    [workspaceId, decision.id],
  );

  // Content buffers seed from the server record; a successful write replaces the whole decision.
  const [title, setTitle] = useState(decision.title);
  const [summary, setSummary] = useState(decision.summary ?? '');
  const [background, setBackground] = useState(decision.background ?? '');
  const [statement, setStatement] = useState(decision.decision ?? '');
  const [rationale, setRationale] = useState(decision.rationale ?? '');
  const [consequences, setConsequences] = useState(decision.consequences ?? '');

  const statementPresent = (decision.decision ?? '').trim().length > 0;

  const apply = (next: DecisionDetailView) => {
    onUpdated(next);
    void history.reload();
  };

  const run = async (key: string, op: () => Promise<DecisionDetailView>) => {
    setBusy(key);
    setBanner(null);
    try {
      apply(await op());
    } catch (error) {
      setBanner(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const patchContent = (patch: UpdateDecisionInput, key: string) => {
    void run(key, () => api.decisions.update(workspaceId, decision.id, patch));
  };

  const saveContent = () => {
    if (!canEdit) return;
    const patch: UpdateDecisionInput = {};
    if (title.trim() && title.trim() !== decision.title) patch.title = title.trim();
    if (summary !== (decision.summary ?? '')) patch.summary = summary.trim() || null;
    if (background !== (decision.background ?? '')) patch.background = background.trim() || null;
    if (statement !== (decision.decision ?? '')) patch.decision = statement.trim() || null;
    if (rationale !== (decision.rationale ?? '')) patch.rationale = rationale.trim() || null;
    if (consequences !== (decision.consequences ?? ''))
      patch.consequences = consequences.trim() || null;
    if (Object.keys(patch).length === 0) return;
    patchContent(patch, 'content');
  };

  const changeCategory = (next: DecisionCategory) => {
    if (next === decision.category || !canEdit) return;
    patchContent({ category: next }, 'category');
  };

  const changeOwner = (next: string) => {
    if (next === decision.owner.id || !canManage || !editable) return;
    void run('owner', () => api.decisions.update(workspaceId, decision.id, { ownerId: next }));
  };

  const propose = () => patchContent({ status: 'PROPOSED' }, 'propose');
  const withdraw = () => patchContent({ status: 'DRAFT' }, 'withdraw');
  const approve = () => void run('approve', () => api.decisions.approve(workspaceId, decision.id));
  const reject = () => void run('reject', () => api.decisions.reject(workspaceId, decision.id));
  const archive = () => void run('archive', () => api.decisions.archive(workspaceId, decision.id));
  const restore = () => void run('restore', () => api.decisions.restore(workspaceId, decision.id));

  const [supersedeTarget, setSupersedeTarget] = useState('');
  const supersede = () => {
    if (!supersedeTarget) return;
    void run('supersede', () =>
      api.decisions.supersede(workspaceId, decision.id, { byDecisionId: supersedeTarget }),
    );
  };

  const removeDecision = () => {
    setBusy('delete');
    setBanner(null);
    api.decisions
      .remove(workspaceId, decision.id)
      .then(() => onDeleted())
      .catch((error: unknown) => {
        setBanner(errorMessage(error));
        setBusy(null);
      });
  };

  // Participants roster ops.
  const participantIds = new Set(decision.participantIds);
  const addableMembers = useMemo(
    () => members.filter((m) => !participantIds.has(m.userId)),
    [members, decision.participantIds],
  );
  const addParticipant = (nextUserId: string) => {
    if (!nextUserId) return;
    void run('participant', () =>
      api.decisions.addParticipant(workspaceId, decision.id, { userId: nextUserId }),
    );
  };
  const removeParticipant = (targetId: string) => {
    void run('participant', () =>
      api.decisions.removeParticipant(workspaceId, decision.id, targetId),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
          <Undo2 className="size-4" aria-hidden="true" />
          Back to vault
        </Button>
        {canManage ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={removeDecision}
            disabled={busy === 'delete'}
          >
            {busy === 'delete' ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="size-3.5" aria-hidden="true" />
            )}
            Delete
          </Button>
        ) : null}
      </div>

      {banner ? (
        <Alert variant="error" title="Update failed">
          {banner}
        </Alert>
      ) : null}

      {!editable ? (
        <Alert variant="info" title={decision.status === 'ARCHIVED' ? 'Archived' : 'Locked'}>
          {decision.status === 'ARCHIVED'
            ? 'This decision is archived and read-only. Restore it to make changes.'
            : 'This decision has been superseded and is kept for history. Its content is locked.'}
        </Alert>
      ) : null}

      <DecisionHeader decision={decision} onOpenDecision={onOpenDecision} />

      <Card title="Decision" description="The full record of what was decided and why.">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="dd-title" className="block text-xs font-medium text-secondary">
              Title
            </label>
            <input
              id="dd-title"
              className={CONTROL}
              value={title}
              disabled={!canEdit}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveContent}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="dd-category" className="block text-xs font-medium text-secondary">
                Category
              </label>
              <select
                id="dd-category"
                className={CONTROL}
                value={decision.category}
                disabled={!canEdit || busy === 'category'}
                onChange={(e) => changeCategory(e.target.value as DecisionCategory)}
              >
                {DECISION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {decisionCategoryLabel(c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="dd-owner" className="block text-xs font-medium text-secondary">
                Owner
              </label>
              <select
                id="dd-owner"
                className={CONTROL}
                value={decision.owner.id}
                disabled={!canManage || !editable || busy === 'owner'}
                onChange={(e) => changeOwner(e.target.value)}
              >
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.userId === userId ? `${m.name} (me)` : m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <FieldBlock
            id="dd-summary"
            label="Summary"
            value={summary}
            disabled={!canEdit}
            onChange={setSummary}
            onBlur={saveContent}
          />
          <FieldBlock
            id="dd-background"
            label="Background"
            value={background}
            disabled={!canEdit}
            onChange={setBackground}
            onBlur={saveContent}
          />
          <FieldBlock
            id="dd-decision"
            label="Decision"
            value={statement}
            disabled={!canEdit}
            onChange={setStatement}
            onBlur={saveContent}
            hint={
              !statementPresent && canEdit
                ? 'Required before this decision can be approved.'
                : undefined
            }
          />
          <FieldBlock
            id="dd-rationale"
            label="Rationale"
            value={rationale}
            disabled={!canEdit}
            onChange={setRationale}
            onBlur={saveContent}
          />
          <FieldBlock
            id="dd-consequences"
            label="Consequences"
            value={consequences}
            disabled={!canEdit}
            onChange={setConsequences}
            onBlur={saveContent}
          />
        </div>
      </Card>

      {canManage && editable ? (
        <LifecycleBar
          decision={decision}
          busy={busy}
          statementPresent={statementPresent}
          candidates={candidates}
          supersedeTarget={supersedeTarget}
          setSupersedeTarget={setSupersedeTarget}
          onPropose={propose}
          onWithdraw={withdraw}
          onApprove={approve}
          onReject={reject}
          onSupersede={supersede}
          onArchive={archive}
          onRestore={restore}
        />
      ) : null}

      <AlternativesCard
        decision={decision}
        canEdit={canEdit}
        busy={busy === 'alternatives'}
        onSave={(alternatives) => patchContent({ alternatives }, 'alternatives')}
      />

      <ReferencesCard
        decision={decision}
        canEdit={canEdit}
        candidates={candidates}
        busy={busy === 'references'}
        onSave={(references) => patchContent({ references }, 'references')}
        onOpenDecision={onOpenDecision}
      />

      <Card title="Participants" description="People tied to this decision.">
        <div className="space-y-3">
          <ul className="flex flex-wrap gap-2">
            {decision.participants.map((p) => {
              const removable =
                canEdit && editable && p.id !== decision.createdBy.id && p.id !== userId;
              return (
                <li
                  key={p.id}
                  className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-2 py-1 pl-1 pr-2 text-xs text-primary"
                >
                  <Avatar name={p.name} size="sm" />
                  <span className="truncate">{p.name}</span>
                  {removable ? (
                    <button
                      type="button"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => removeParticipant(p.id)}
                      className="text-muted hover:text-danger focus-visible:outline-none"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {canEdit && editable && addableMembers.length > 0 ? (
            <div className="flex items-center gap-2 border-t border-border-subtle pt-3">
              <Users className="size-4 text-muted" aria-hidden="true" />
              <select
                aria-label="Add a participant"
                className={CONTROL + ' max-w-xs'}
                value=""
                disabled={busy === 'participant'}
                onChange={(e) => {
                  addParticipant(e.target.value);
                  e.currentTarget.value = '';
                }}
              >
                <option value="">Add participant…</option>
                {addableMembers.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.userId === userId ? `${m.name} (me)` : m.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      </Card>

      <CommentsCard
        workspaceId={workspaceId}
        decisionId={decision.id}
        comments={comments}
        userId={userId}
        canManage={canManage}
        onChanged={() => void comments.reload()}
      />

      <Card title="History" description="The timeline of this decision.">
        {history.loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : history.error ? (
          <Alert variant="error" title="Could not load history">
            {history.error}
          </Alert>
        ) : (history.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted">No history yet.</p>
        ) : (
          <ul className="space-y-3">
            {history.data?.map((h: DecisionHistoryView) => (
              <li key={h.id} className="flex items-start gap-3">
                <Avatar name={h.actor.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-primary">
                    <span className="font-medium">{h.actor.name}</span> · {h.message}
                  </p>
                  <p className="text-2xs text-muted">
                    {decisionHistoryLabel(h.type)}
                    {' · '}
                    {formatDecisionDate(h.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---- header (status, dates, context) ----

function DecisionHeader({
  decision,
  onOpenDecision,
}: {
  decision: DecisionDetailView;
  onOpenDecision: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={decisionStatusTone(decision.status)}>
          {decisionStatusLabel(decision.status)}
        </Badge>
        <Badge tone="neutral">{decisionCategoryLabel(decision.category)}</Badge>
        {decision.contextSummary ? (
          <span className="inline-flex items-center gap-1 text-2xs text-muted">
            <Link2 className="size-3" aria-hidden="true" />
            {decision.contextSummary.kind.toLowerCase()} · {decision.contextSummary.label}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Avatar name={decision.owner.name} size="sm" />
          Owner · {decision.owner.name}
        </span>
        <span>
          Created by {decision.createdBy.name} · {formatDecisionDate(decision.createdAt)}
        </span>
        {decision.approvedAt ? (
          <span>Approved · {formatDecisionDate(decision.approvedAt)}</span>
        ) : null}
        {decision.rejectedAt ? (
          <span>Rejected · {formatDecisionDate(decision.rejectedAt)}</span>
        ) : null}
        {decision.supersededByTitle ? (
          <button
            type="button"
            onClick={() => decision.supersededById && onOpenDecision(decision.supersededById)}
            className="inline-flex items-center gap-1 text-secondary underline-offset-2 hover:underline"
          >
            Superseded by “{decision.supersededByTitle}”
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ---- a labelled textarea field with optional hint ----

function FieldBlock({
  id,
  label,
  value,
  disabled,
  onChange,
  onBlur,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
  hint?: string | undefined;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-secondary">
        {label}
      </label>
      <textarea
        id={id}
        className={AREA}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="—"
      />
      {hint ? (
        <p className="text-2xs text-warning" role="note">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

// ---- lifecycle controls ----

function LifecycleBar({
  decision,
  busy,
  statementPresent,
  candidates,
  supersedeTarget,
  setSupersedeTarget,
  onPropose,
  onWithdraw,
  onApprove,
  onReject,
  onSupersede,
  onArchive,
  onRestore,
}: {
  decision: DecisionDetailView;
  busy: string | null;
  statementPresent: boolean;
  candidates: DecisionView[];
  supersedeTarget: string;
  setSupersedeTarget: (id: string) => void;
  onPropose: () => void;
  onWithdraw: () => void;
  onApprove: () => void;
  onReject: () => void;
  onSupersede: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const status = decision.status;
  const spinner = (key: string) =>
    busy === key ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null;
  const showSupersede = canSupersede(status) && candidates.length > 0;

  return (
    <Card title="Actions" description="Move this decision through its lifecycle.">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {canPropose(status) ? (
            <Button size="sm" variant="secondary" onClick={onPropose} disabled={busy !== null}>
              {spinner('propose')}
              <Send className="size-3.5" aria-hidden="true" />
              Propose for review
            </Button>
          ) : null}
          {canWithdrawToDraft(status) ? (
            <Button size="sm" variant="ghost" onClick={onWithdraw} disabled={busy !== null}>
              <Undo2 className="size-3.5" aria-hidden="true" />
              Back to draft
            </Button>
          ) : null}
          {canApprove(status) ? (
            <Button
              size="sm"
              onClick={onApprove}
              disabled={busy !== null || !statementPresent}
              title={
                !statementPresent ? 'Write the decision statement before approving' : undefined
              }
            >
              {spinner('approve')}
              <Check className="size-3.5" aria-hidden="true" />
              Approve
            </Button>
          ) : null}
          {canReject(status) ? (
            <Button size="sm" variant="destructive" onClick={onReject} disabled={busy !== null}>
              {spinner('reject')}
              <X className="size-3.5" aria-hidden="true" />
              Reject
            </Button>
          ) : null}
          {canArchive(status) ? (
            <Button size="sm" variant="ghost" onClick={onArchive} disabled={busy !== null}>
              {spinner('archive')}
              <Archive className="size-3.5" aria-hidden="true" />
              Archive
            </Button>
          ) : null}
          {canRestore(status) ? (
            <Button size="sm" variant="secondary" onClick={onRestore} disabled={busy !== null}>
              {spinner('restore')}
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Restore
            </Button>
          ) : null}
          {status === 'APPROVED' && !statementPresent ? (
            <span className="text-2xs text-muted">Approving needs a decision statement.</span>
          ) : null}
        </div>

        {showSupersede ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
            <span className="text-xs text-secondary">Supersede with a newer decision:</span>
            <select
              aria-label="Choose a replacement decision"
              className={CONTROL + ' max-w-xs'}
              value={supersedeTarget}
              onChange={(e) => setSupersedeTarget(e.target.value)}
            >
              <option value="">Select…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              onClick={onSupersede}
              disabled={!supersedeTarget || busy !== null}
            >
              {spinner('supersede')}
              Supersede
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

// ---- alternatives (REPLACE semantics) ----

type AltDraft = DecisionAlternativeInput & { _key: string };

function toAltDraft(a: DecisionAlternativeView): AltDraft {
  return {
    _key: a.id,
    label: a.label,
    description: a.description,
    advantages: a.advantages,
    disadvantages: a.disadvantages,
    rejectionReason: a.rejectionReason,
    chosen: a.chosen,
  };
}

function AlternativesCard({
  decision,
  canEdit,
  busy,
  onSave,
}: {
  decision: DecisionDetailView;
  canEdit: boolean;
  busy: boolean;
  onSave: (alternatives: DecisionAlternativeInput[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<AltDraft[]>(() => decision.alternatives.map(toAltDraft));

  const beginEdit = () => {
    setDrafts(decision.alternatives.map(toAltDraft));
    setEditing(true);
  };

  const update = (key: string, patch: Partial<AltDraft>) =>
    setDrafts((prev) =>
      prev.map((d) => {
        if (d._key === key) return { ...d, ...patch };
        // Choosing one clears the others (≤1 chosen, matching the server rule).
        if (patch.chosen === true) return { ...d, chosen: false };
        return d;
      }),
    );

  const add = () =>
    setDrafts((prev) => [
      ...prev,
      { _key: `new-${prev.length}-${Date.now()}`, label: '', chosen: false },
    ]);

  const remove = (key: string) => setDrafts((prev) => prev.filter((d) => d._key !== key));

  const save = () => {
    const cleaned = drafts
      .filter((d) => d.label.trim().length > 0)
      .map(({ _key: _drop, ...rest }) => ({
        ...rest,
        label: rest.label.trim(),
      })) as DecisionAlternativeInput[];
    onSave(cleaned);
    setEditing(false);
  };

  // Read-only view.
  if (!editing) {
    return (
      <Card
        title="Alternatives"
        description="The options considered, and why each won or lost."
        action={
          canEdit ? (
            <Button size="sm" variant="secondary" onClick={beginEdit}>
              Edit
            </Button>
          ) : null
        }
      >
        {decision.alternatives.length === 0 ? (
          <p className="text-sm text-muted">No alternatives recorded.</p>
        ) : (
          <ul className="space-y-2">
            {decision.alternatives.map((a) => (
              <li key={a.id} className="rounded-lg border border-border-subtle bg-surface-2 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-primary">{a.label}</span>
                  {a.chosen ? <Badge tone="success">Chosen</Badge> : null}
                </div>
                {a.description ? (
                  <p className="mt-1 text-xs text-secondary">{a.description}</p>
                ) : null}
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {a.advantages ? (
                    <p className="text-2xs text-secondary">
                      <span className="font-medium text-primary">Pros · </span>
                      {a.advantages}
                    </p>
                  ) : null}
                  {a.disadvantages ? (
                    <p className="text-2xs text-secondary">
                      <span className="font-medium text-primary">Cons · </span>
                      {a.disadvantages}
                    </p>
                  ) : null}
                </div>
                {a.rejectionReason ? (
                  <p className="mt-1 text-2xs text-muted">
                    <span className="font-medium text-primary">Why not · </span>
                    {a.rejectionReason}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  // Edit mode.
  return (
    <Card title="Alternatives" description="Add options considered. Mark at most one as chosen.">
      <div className="space-y-3">
        {drafts.map((d, i) => (
          <div
            key={d._key}
            className="space-y-2 rounded-lg border border-border-subtle bg-surface-2 p-3"
          >
            <div className="flex items-center gap-2">
              <input
                aria-label={`Alternative ${i + 1} label`}
                className={CONTROL}
                value={d.label}
                onChange={(e) => update(d._key, { label: e.target.value })}
                placeholder="Option name"
              />
              <label className="inline-flex shrink-0 items-center gap-1.5 text-2xs text-secondary">
                <input
                  type="radio"
                  name="chosen-alternative"
                  checked={d.chosen === true}
                  onChange={() => update(d._key, { chosen: true })}
                />
                Chosen
              </label>
              <IconButton aria-label={`Remove alternative ${i + 1}`} onClick={() => remove(d._key)}>
                <Trash2 className="size-4" aria-hidden="true" />
              </IconButton>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                aria-label="Advantages"
                className={CONTROL}
                value={d.advantages ?? ''}
                onChange={(e) => update(d._key, { advantages: e.target.value })}
                placeholder="Pros"
              />
              <input
                aria-label="Disadvantages"
                className={CONTROL}
                value={d.disadvantages ?? ''}
                onChange={(e) => update(d._key, { disadvantages: e.target.value })}
                placeholder="Cons"
              />
              <input
                aria-label="Rejection reason"
                className={CONTROL}
                value={d.rejectionReason ?? ''}
                onChange={(e) => update(d._key, { rejectionReason: e.target.value })}
                placeholder="Why not chosen"
              />
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" variant="ghost" onClick={add}>
            <Plus className="size-4" aria-hidden="true" />
            Add alternative
          </Button>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Save alternatives
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---- references (REPLACE semantics) ----

type RefDraft = DecisionReferenceInput & { _key: string };

function toRefDraft(r: DecisionReferenceView): RefDraft {
  return { _key: r.id, type: r.type, label: r.label, url: r.url, entityId: r.entityId };
}

/** The reference kinds editable here: url-based evidence, or a link to another decision. */
const EDITABLE_REF_TYPES: readonly DecisionReferenceType[] = [
  'DOCUMENT',
  'LINK',
  'FILE',
  'DECISION',
];

function ReferencesCard({
  decision,
  canEdit,
  candidates,
  busy,
  onSave,
  onOpenDecision,
}: {
  decision: DecisionDetailView;
  canEdit: boolean;
  candidates: DecisionView[];
  busy: boolean;
  onSave: (references: DecisionReferenceInput[]) => void;
  onOpenDecision: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<RefDraft[]>(() => decision.references.map(toRefDraft));

  const beginEdit = () => {
    setDrafts(decision.references.map(toRefDraft));
    setEditing(true);
  };

  const update = (key: string, patch: Partial<RefDraft>) =>
    setDrafts((prev) => prev.map((d) => (d._key === key ? { ...d, ...patch } : d)));

  const add = () =>
    setDrafts((prev) => [
      ...prev,
      { _key: `new-${prev.length}-${Date.now()}`, type: 'LINK', label: '' },
    ]);

  const remove = (key: string) => setDrafts((prev) => prev.filter((d) => d._key !== key));

  const save = () => {
    const cleaned = drafts
      .filter((d) => d.label.trim().length > 0)
      .map(({ _key: _drop, ...rest }) => ({
        ...rest,
        label: rest.label.trim(),
        url: rest.url?.trim() || null,
        entityId: rest.entityId || null,
      })) as DecisionReferenceInput[];
    onSave(cleaned);
    setEditing(false);
  };

  if (!editing) {
    return (
      <Card
        title="References"
        description="The evidence this decision cites."
        action={
          canEdit ? (
            <Button size="sm" variant="secondary" onClick={beginEdit}>
              Edit
            </Button>
          ) : null
        }
      >
        {decision.references.length === 0 ? (
          <p className="text-sm text-muted">No references cited.</p>
        ) : (
          <ul className="space-y-1.5">
            {decision.references.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <Link2 className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
                <Badge tone="neutral">{decisionReferenceLabel(r.type)}</Badge>
                {r.type === 'DECISION' && r.entityId ? (
                  <button
                    type="button"
                    onClick={() => onOpenDecision(r.entityId as string)}
                    className="truncate text-primary underline-offset-2 hover:underline"
                  >
                    {r.resolvedLabel ?? r.label}
                  </button>
                ) : r.url ? (
                  <span className="truncate text-secondary" title={r.url}>
                    {r.label}
                  </span>
                ) : (
                  <span className="truncate text-secondary">{r.resolvedLabel ?? r.label}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  return (
    <Card title="References" description="Cite documents, links, files, or another decision.">
      <div className="space-y-3">
        {drafts.map((d, i) => (
          <div
            key={d._key}
            className="space-y-2 rounded-lg border border-border-subtle bg-surface-2 p-3"
          >
            <div className="flex items-center gap-2">
              <select
                aria-label={`Reference ${i + 1} type`}
                className={CONTROL + ' max-w-[8rem]'}
                value={EDITABLE_REF_TYPES.includes(d.type) ? d.type : 'LINK'}
                onChange={(e) => {
                  const type = e.target.value as DecisionReferenceType;
                  update(d._key, { type, url: null, entityId: null });
                }}
              >
                {EDITABLE_REF_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {decisionReferenceLabel(t)}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Reference ${i + 1} label`}
                className={CONTROL}
                value={d.label}
                onChange={(e) => update(d._key, { label: e.target.value })}
                placeholder="Label"
              />
              <IconButton aria-label={`Remove reference ${i + 1}`} onClick={() => remove(d._key)}>
                <Trash2 className="size-4" aria-hidden="true" />
              </IconButton>
            </div>
            {d.type === 'DECISION' ? (
              <select
                aria-label="Referenced decision"
                className={CONTROL}
                value={d.entityId ?? ''}
                onChange={(e) => update(d._key, { entityId: e.target.value || null })}
              >
                <option value="">Select a decision…</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-label="URL"
                className={CONTROL}
                value={d.url ?? ''}
                onChange={(e) => update(d._key, { url: e.target.value })}
                placeholder="https://…"
              />
            )}
          </div>
        ))}
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" variant="ghost" onClick={add}>
            <Plus className="size-4" aria-hidden="true" />
            Add reference
          </Button>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Save references
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---- discussion ----

function CommentsCard({
  workspaceId,
  decisionId,
  comments,
  userId,
  canManage,
  onChanged,
}: {
  workspaceId: string;
  decisionId: string;
  comments: ReturnType<typeof useResource<DecisionCommentView[]>>;
  userId: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || body.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.decisions.addComment(workspaceId, decisionId, { body: body.trim() });
      setBody('');
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const removeComment = async (commentId: string) => {
    setError(null);
    try {
      await api.decisions.deleteComment(workspaceId, decisionId, commentId);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Card title="Discussion" description="Talk this decision through. Separate from chat.">
      <div className="space-y-4">
        {comments.loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : comments.error ? (
          <Alert variant="error" title="Could not load discussion">
            {comments.error}
          </Alert>
        ) : (comments.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted">No comments yet.</p>
        ) : (
          <ul className="space-y-3">
            {comments.data?.map((c: DecisionCommentView) => {
              const mine = c.author.id === userId;
              return (
                <li key={c.id} className="flex items-start gap-3">
                  <Avatar name={c.author.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-primary">{c.body}</p>
                    <p className="text-2xs text-muted">
                      {c.author.name} · {formatDecisionDate(c.createdAt)}
                    </p>
                  </div>
                  {mine || canManage ? (
                    <IconButton
                      aria-label="Delete comment"
                      onClick={() => void removeComment(c.id)}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </IconButton>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <form className="space-y-2" onSubmit={submit}>
          {error ? (
            <p className="text-2xs text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <textarea
            aria-label="Add a comment"
            className={AREA}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            maxLength={2000}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={busy || body.trim().length === 0}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Comment
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}
