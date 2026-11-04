import {
  ClipboardList,
  Folder,
  Home,
  MessageSquare,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type NavId = 'home' | 'mywork' | 'projects' | 'messages' | 'team' | 'settings';

export type NavGroup = 'main' | 'workspace';

export interface NavItem {
  id: NavId;
  label: string;
  icon: LucideIcon;
  /** Sidebar section: primary navigation vs workspace management. Drives the group divider. */
  group: NavGroup;
}

/**
 * Navigation rail (redesign brief §3.1). Only surfaces with real, implemented functionality are
 * listed — no placeholder entry points. Grouping separates the main task nav (Home / My Work /
 * Projects / Conversations) from workspace management (Members / Settings).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'home', label: 'Home', icon: Home, group: 'main' },
  { id: 'mywork', label: 'My Work', icon: ClipboardList, group: 'main' },
  { id: 'projects', label: 'Projects', icon: Folder, group: 'main' },
  { id: 'messages', label: 'Conversations', icon: MessageSquare, group: 'main' },
  { id: 'team', label: 'Members', icon: Users, group: 'workspace' },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'workspace' },
] as const;

export const MAIN_NAV: readonly NavItem[] = NAV_ITEMS.filter((item) => item.group === 'main');
export const WORKSPACE_NAV: readonly NavItem[] = NAV_ITEMS.filter(
  (item) => item.group === 'workspace',
);
