import {
  LayoutDashboard,
  FolderClosed,
  Image as ImageIcon,
  FileText,
  Trash2,
  Activity,
  Settings,
  UserRound,
  Users,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * One source of truth for navigation, read by both the desktop sidebar and the mobile tab
 * bar. Order matters on mobile: the first `TAB_SLOTS` entries get a tab, the rest move
 * behind "More".
 */
export const USER_NAV: readonly NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/folders', label: 'Folders', icon: FolderClosed },
  { href: '/media', label: 'Media', icon: ImageIcon },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/trash', label: 'Trash', icon: Trash2 },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/profile', label: 'Profile', icon: UserRound },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export const ADMIN_NAV: readonly NavItem[] = [
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/stats', label: 'Statistics', icon: BarChart3 },
];

/**
 * Four destinations plus "More" is the most a bottom bar holds before the labels start
 * truncating on a narrow phone.
 */
export const TAB_SLOTS = 4;

/** `/folders` must not light up for `/foldersomething`, hence the trailing slash. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
