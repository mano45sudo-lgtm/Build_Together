import type { ReactNode } from 'react';
import type { InvitationStatus, WorkspaceRole } from '@buildtogether/shared';
import { cn } from '../../lib/cn';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<BadgeTone, string> = {
  neutral: 'border-border-default bg-surface-3 text-secondary',
  accent: 'border-accent/40 bg-accent/12 text-accent',
  success: 'border-success/40 bg-success/12 text-success',
  warning: 'border-warning/40 bg-warning/12 text-warning',
  danger: 'border-danger/40 bg-danger/12 text-danger',
  info: 'border-info/40 bg-info/12 text-info',
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

/** Small status/role label. Restrained tints — the accent is reserved for selection and primary actions. */
export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const ROLE_TONES: Record<WorkspaceRole, BadgeTone> = {
  OWNER: 'accent',
  ADMIN: 'info',
  MEMBER: 'neutral',
};

export function roleTone(role: WorkspaceRole): BadgeTone {
  return ROLE_TONES[role];
}

const INVITATION_TONES: Record<InvitationStatus, BadgeTone> = {
  PENDING: 'warning',
  ACCEPTED: 'success',
  EXPIRED: 'neutral',
  REVOKED: 'danger',
};

export function invitationTone(status: InvitationStatus): BadgeTone {
  return INVITATION_TONES[status];
}
