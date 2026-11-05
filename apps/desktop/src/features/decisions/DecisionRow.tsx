import { ChevronRight, Link2 } from 'lucide-react';
import type { DecisionView } from '@buildtogether/shared';
import { Badge } from '../../components/ui/Badge';
import {
  decisionCategoryLabel,
  decisionStatusLabel,
  decisionStatusTone,
  formatDecisionDate,
} from './decisionUtils';

/**
 * A single horizontal decision row in the vault (DESIGN.md: lists read as divided rows, not a wall of
 * cards). Title + one-line summary, the optional context it came from, then right-aligned owner /
 * updated / status. The whole row is one control that opens the decision; every mutation lives in the
 * detail, where it is permission-checked. `contextSummary` is resolved server-side and only present
 * when the linked project / conversation / task still exists in this workspace — a removed context
 * simply reads as a plain workspace decision, with no dead link offered.
 */
export function DecisionRow({
  decision,
  onOpen,
}: {
  decision: DecisionView;
  onOpen: (decision: DecisionView) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(decision)}
      className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 ease-out hover:bg-surface-2 focus-visible:outline-none focus-visible:bg-surface-2"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-primary">{decision.title}</span>
          <span className="shrink-0 text-2xs text-muted">
            {decisionCategoryLabel(decision.category)}
          </span>
        </span>
        {decision.summary ? (
          <span className="mt-0.5 block truncate text-xs text-secondary">{decision.summary}</span>
        ) : null}
        {decision.contextSummary ? (
          <span className="mt-0.5 inline-flex items-center gap-1 text-2xs text-muted">
            <Link2 className="size-3" aria-hidden="true" />
            <span className="truncate">{decision.contextSummary.label}</span>
          </span>
        ) : null}
      </span>

      <span className="hidden shrink-0 items-center gap-4 md:flex">
        <span className="w-28 truncate text-right text-xs text-muted" title={decision.owner.name}>
          {decision.owner.name}
        </span>
        <span className="w-20 text-right text-xs tabular-nums text-muted">
          {formatDecisionDate(decision.updatedAt)}
        </span>
        <Badge tone={decisionStatusTone(decision.status)}>
          {decisionStatusLabel(decision.status)}
        </Badge>
      </span>

      <ChevronRight
        className="size-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden="true"
      />
    </button>
  );
}
