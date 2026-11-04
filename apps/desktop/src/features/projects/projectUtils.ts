import type { ProjectStatus, ProjectVisibility } from '@buildtogether/shared';
import type { BadgeTone } from '../../components/ui/Badge';

/**
 * Presentation helpers for the projects feature. Pure, dependency-free and locale-stable so a project
 * card and the project header always render the same status/visibility/date without drift. These are
 * VISUAL only — they carry no authorization meaning.
 */

const STATUS_TONES: Record<ProjectStatus, BadgeTone> = {
  PLANNING: 'info',
  ACTIVE: 'success',
  ON_HOLD: 'warning',
  COMPLETED: 'neutral',
};

export function projectStatusTone(status: ProjectStatus): BadgeTone {
  return STATUS_TONES[status];
}

/** Human label for a status enum (SCREAMING_SNAKE → Title Case). */
export function projectStatusLabel(status: ProjectStatus): string {
  return status
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

const VISIBILITY_TONES: Record<ProjectVisibility, BadgeTone> = {
  WORKSPACE: 'neutral',
  PRIVATE: 'accent',
};

export function projectVisibilityTone(visibility: ProjectVisibility): BadgeTone {
  return VISIBILITY_TONES[visibility];
}

export function projectVisibilityLabel(visibility: ProjectVisibility): string {
  return visibility === 'PRIVATE' ? 'Private' : 'Workspace';
}

/** `YYYY-MM-DDTHH:mm:ss.sssZ` (or a `YYYY-MM-DD` date) → a stable, readable absolute date. */
export function formatProjectDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
