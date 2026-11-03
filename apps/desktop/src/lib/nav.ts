import {
  Archive,
  Folder,
  Home,
  ListChecks,
  Plug,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type NavId =
  'home' | 'my-work' | 'projects' | 'connected-apps' | 'decision-vault' | 'team' | 'settings';

export interface NavItem {
  id: NavId;
  label: string;
  icon: LucideIcon;
  /** Product feature that will eventually live here — surfaced honestly in the placeholder. */
  arrival: string;
}

/**
 * Project-centric primary navigation (Phase 1 brief §7). These are entry points only —
 * no future-phase functionality is implemented. Content regions show honest placeholders.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    arrival: 'Workspace overview arrives in a later phase.',
  },
  {
    id: 'my-work',
    label: 'My Work',
    icon: ListChecks,
    arrival: 'Assigned tasks arrive with task management.',
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: Folder,
    arrival: 'Projects arrive with workspace management.',
  },
  {
    id: 'connected-apps',
    label: 'Connected Apps',
    icon: Plug,
    arrival: 'Figma, GitHub and more arrive with integrations.',
  },
  {
    id: 'decision-vault',
    label: 'Decision Vault',
    icon: Archive,
    arrival: 'The Decision Vault arrives in a later phase.',
  },
  { id: 'team', label: 'Team', icon: Users, arrival: 'Team and presence arrive with Nexconn.' },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    arrival: 'Settings arrive with authentication.',
  },
] as const;
