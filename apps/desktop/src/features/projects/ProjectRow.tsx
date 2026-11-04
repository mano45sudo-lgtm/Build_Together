import { ChevronRight, Lock } from 'lucide-react';
import type { ProjectView } from '@buildtogether/shared';
import { Badge } from '../../components/ui/Badge';
import { formatProjectDate, projectStatusLabel, projectStatusTone } from './projectUtils';

/** Up to two initials from a project name, for rows without an emoji icon. */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

/**
 * A single horizontal project row (redesign brief §4.4): icon/initials, name + key, short
 * description, and right-aligned owner / last-updated / status. Rows sit in a divided list, so the
 * list reads as data, not a wall of cards. The whole row is one control that opens the project;
 * mutations live in the project workspace, where they are permission-checked.
 */
export function ProjectRow({
  project,
  onOpen,
}: {
  project: ProjectView;
  onOpen: (project: ProjectView) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(project)}
      className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 ease-out hover:bg-surface-2 focus-visible:outline-none focus-visible:bg-surface-2"
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-3 text-sm font-medium text-secondary"
        style={project.color ? { color: project.color } : undefined}
        aria-hidden="true"
      >
        {project.icon || initials(project.name)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-primary">{project.name}</span>
          <span className="shrink-0 font-mono text-2xs text-muted">{project.projectKey}</span>
          {project.visibility === 'PRIVATE' ? (
            <span className="inline-flex shrink-0 items-center text-muted">
              <Lock className="size-3.5" aria-hidden="true" />
              <span className="sr-only">Private to owner, creator and admins</span>
            </span>
          ) : null}
        </span>
        {project.description ? (
          <span className="mt-0.5 block truncate text-xs text-secondary">
            {project.description}
          </span>
        ) : null}
      </span>

      <span className="hidden shrink-0 items-center gap-4 md:flex">
        <span className="w-28 truncate text-right text-xs text-muted" title={project.owner.name}>
          {project.owner.name}
        </span>
        <span className="w-20 text-right text-xs tabular-nums text-muted">
          {formatProjectDate(project.updatedAt)}
        </span>
        <Badge tone={projectStatusTone(project.status)}>{projectStatusLabel(project.status)}</Badge>
      </span>

      <ChevronRight
        className="size-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden="true"
      />
    </button>
  );
}
