import type { ProjectHealthState, RecommendationPriority, RiskLevel } from '@buildtogether/shared';
import type { BadgeTone } from '../../components/ui/Badge';

export const HEALTH: Record<ProjectHealthState, { label: string; tone: BadgeTone }> = {
  ON_TRACK: { label: 'On track', tone: 'success' },
  NEEDS_ATTENTION: { label: 'Needs attention', tone: 'warning' },
  AT_RISK: { label: 'At risk', tone: 'danger' },
};

export const LEVEL_TONE: Record<RiskLevel | RecommendationPriority, BadgeTone> = {
  LOW: 'neutral',
  MEDIUM: 'warning',
  HIGH: 'danger',
};

export const levelLabel = (level: RiskLevel | RecommendationPriority): string =>
  level.charAt(0) + level.slice(1).toLowerCase();
