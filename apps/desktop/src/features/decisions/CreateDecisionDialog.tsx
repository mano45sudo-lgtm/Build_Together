import { useState } from 'react';
import type {
  CreateDecisionInput,
  DecisionCategory,
  DecisionDetailView,
  MemberSummary,
  ProjectView,
} from '@buildtogether/shared';
import { DECISION_CATEGORIES } from '@buildtogether/shared';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { errorMessage } from '../../lib/bridge';
import { api } from '../../lib/data';
import { decisionCategoryLabel } from './decisionUtils';

const CONTROL =
  'h-9 w-full rounded-md border border-border-default bg-surface-2 px-3 text-sm text-primary focus-visible:border-accent focus-visible:outline-none';
const AREA = CONTROL + ' h-20 resize-none py-2 leading-relaxed';

/** Only the two entry statuses are offered at create — approval / rejection / supersede are lifecycle moves. */
type CreateStatus = 'DRAFT' | 'PROPOSED';
const CREATE_STATUSES: readonly CreateStatus[] = ['DRAFT', 'PROPOSED'];

export interface CreateDecisionDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  /** Workspace members — the only valid owners (the server re-checks membership on create). */
  members: MemberSummary[];
  /** Projects the caller can see — a decision links to at most one context, chosen here. */
  projects: ProjectView[];
  /** When set (creating from a project), that context is preselected as the link. */
  defaultProjectId?: string;
  userId: string;
  onCreated: (decision: DecisionDetailView) => void;
}

/**
 * Record a decision. Only a TITLE is required; everything else is optional and defaulted server-side
 * (status DRAFT, category GENERAL, owner = the creator). A decision is written deliberately by a human
 * — it is never auto-derived from a message (decisions.ts). Alternatives, references and participants
 * are curated in the detail after creation, so this form stays a fast capture rather than a wall of
 * inputs. The SERVER re-derives the source from whichever context link is set and re-validates every
 * id inside the workspace.
 */
export function CreateDecisionDialog({
  open,
  onClose,
  workspaceId,
  members,
  projects,
  defaultProjectId,
  userId,
  onCreated,
}: CreateDecisionDialogProps) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [background, setBackground] = useState('');
  const [decision, setDecision] = useState('');
  const [rationale, setRationale] = useState('');
  const [consequences, setConsequences] = useState('');
  const [category, setCategory] = useState<DecisionCategory>('GENERAL');
  const [status, setStatus] = useState<CreateStatus>('DRAFT');
  const [ownerId, setOwnerId] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId ?? '');

  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | undefined>(undefined);

  const reset = () => {
    setTitle('');
    setSummary('');
    setBackground('');
    setDecision('');
    setRationale('');
    setConsequences('');
    setCategory('GENERAL');
    setStatus('DRAFT');
    setOwnerId('');
    setProjectId(defaultProjectId ?? '');
    setBanner(null);
    setTitleError(undefined);
  };

  const close = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || title.trim().length === 0) return;
    setSubmitting(true);
    setBanner(null);
    setTitleError(undefined);
    const input: CreateDecisionInput = { title: title.trim(), status, category };
    if (summary.trim()) input.summary = summary.trim();
    if (background.trim()) input.background = background.trim();
    if (decision.trim()) input.decision = decision.trim();
    if (rationale.trim()) input.rationale = rationale.trim();
    if (consequences.trim()) input.consequences = consequences.trim();
    if (ownerId) input.ownerId = ownerId;
    if (projectId) input.projectId = projectId;
    try {
      const created = await api.decisions.create(workspaceId, input);
      reset();
      onCreated(created);
    } catch (error) {
      const details = (error as { details?: Record<string, string[]> }).details;
      setTitleError(details?.['title']?.[0]);
      setBanner(errorMessage(error));
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New decision"
      description="Capture a decision your team can point back to. Only a title is required — the rest can be filled in later."
      className="max-w-lg"
    >
      <form className="space-y-4" onSubmit={submit}>
        {banner ? <Alert variant="error">{banner}</Alert> : null}

        <Field label="Title" htmlFor="dc-title" required error={titleError}>
          <Input
            id="dc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Adopt a monochrome design system"
            maxLength={200}
            autoFocus
          />
        </Field>

        <Field
          label="Summary"
          htmlFor="dc-summary"
          hint="Optional. One line a scanter can read first."
        >
          <Input
            id="dc-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Short restatement of what was decided"
            maxLength={500}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category" htmlFor="dc-category">
            <select
              id="dc-category"
              className={CONTROL}
              value={category}
              onChange={(e) => setCategory(e.target.value as DecisionCategory)}
            >
              {DECISION_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {decisionCategoryLabel(c)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status" htmlFor="dc-status">
            <select
              id="dc-status"
              className={CONTROL}
              value={status}
              onChange={(e) => setStatus(e.target.value as CreateStatus)}
            >
              {CREATE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === 'DRAFT' ? 'Draft' : 'Proposed for review'}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Background"
          htmlFor="dc-background"
          hint="Optional. The situation and forces that made this a decision."
        >
          <textarea
            id="dc-background"
            className={AREA}
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            placeholder="Why did this need deciding?"
            maxLength={4000}
          />
        </Field>

        <Field
          label="Decision"
          htmlFor="dc-decision"
          hint="Optional now, required to approve. State the decision in one clear sentence."
        >
          <textarea
            id="dc-decision"
            className={AREA}
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
            placeholder="We decided to…"
            maxLength={4000}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Rationale"
            htmlFor="dc-rationale"
            hint="Optional. Why this over the alternatives."
          >
            <textarea
              id="dc-rationale"
              className={AREA}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Why we chose this"
              maxLength={4000}
            />
          </Field>
          <Field
            label="Consequences"
            htmlFor="dc-consequences"
            hint="Optional. What follows from it."
          >
            <textarea
              id="dc-consequences"
              className={AREA}
              value={consequences}
              onChange={(e) => setConsequences(e.target.value)}
              placeholder="What this commits us to"
              maxLength={4000}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {projects.length > 0 ? (
            <Field
              label="Context"
              htmlFor="dc-project"
              hint="Optional. Link this decision to a project."
            >
              <select
                id="dc-project"
                className={CONTROL}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">No link (workspace decision)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field
            label="Owner"
            htmlFor="dc-owner"
            hint="Optional. The accountable person. Defaults to you."
          >
            <select
              id="dc-owner"
              className={CONTROL}
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
            >
              <option value="">Me</option>
              {members
                .filter((m) => m.userId !== userId)
                .map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
            </select>
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={title.trim().length === 0}>
            Create decision
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
