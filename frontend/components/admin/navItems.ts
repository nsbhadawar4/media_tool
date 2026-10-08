import {
  LayoutDashboard,
  FolderClosed,
  Image as ImageIcon,
  FileText,
  Gamepad2,
  GraduationCap,
  Activity,
  Settings,
  UserRound,
  Users,
  BarChart3,
  Star,
  HardDrive,
  BookOpenCheck,
  LayoutTemplate,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * A destination in the target navigation whose page does not exist yet. The sidebar shows it
   * as a disabled "Soon" row and the mobile tab bar leaves it out; adding the page is a matter
   * of deleting this flag.
   */
  planned?: boolean;
  /** The website section that opens or closes this area (/admin/content/sections). */
  section?: string;
}

export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

/**
 * One source of truth for navigation, read by both the desktop sidebar and the mobile tab
 * bar. Order matters on mobile: the first `TAB_SLOTS` entries get a tab, the rest move
 * behind "More".
 *
 * The user application never lists an admin destination; administrators reach the admin
 * panel through the sidebar's separate cross-link. Trash and the full activity log are not
 * in the user nav either: they are reached from the dashboard (storage card, "View all"
 * activity) and from Settings, which keeps the sidebar to the library itself.
 */
export const USER_NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'Library',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/folders', label: 'Folders', icon: FolderClosed },
      { href: '/media', label: 'Media', icon: ImageIcon },
      { href: '/documents', label: 'Documents', icon: FileText },
      { href: '/games', label: 'Games', icon: Gamepad2, section: 'games' },
      { href: '/kid-games', label: 'Kid Games', icon: GraduationCap, section: 'kid-games' },
      { href: '/courses', label: 'Courses', icon: BookOpenCheck, section: 'kid-games' },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/profile', label: 'Profile', icon: UserRound },
      { href: '/manage-storage', label: 'Storage', icon: HardDrive },
      { href: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export const ADMIN_NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, planned: true },
    ],
  },
  {
    label: 'Manage',
    items: [
      { href: '/admin/users', label: 'Users', icon: Users },
      { href: '/admin/reviews', label: 'Reviews', icon: Star },
      { href: '/admin/content', label: 'Content', icon: LayoutTemplate },
      { href: '/admin/media', label: 'Media', icon: ImageIcon, planned: true },
      { href: '/admin/documents', label: 'Documents', icon: FileText, planned: true },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/admin/activity', label: 'Activity', icon: Activity },
      { href: '/admin/settings', label: 'Settings', icon: Settings, planned: true },
    ],
  },
];

/** The groups without areas whose website section is switched off. */
export function openNavGroups(groups: readonly NavGroup[], isSectionOn: (key: string) => boolean): NavGroup[] {
  return groups.map((group) => ({ ...group, items: group.items.filter((item) => !item.section || isSectionOn(item.section)) }));
}

/** Flat list of real pages in display order — what the mobile tab bar slices into tabs and "More". */
export function liveNavItems(groups: readonly NavGroup[]): NavItem[] {
  return groups.flatMap((group) => group.items).filter((item) => !item.planned);
}

/**
 * Four destinations plus "More" is the most a bottom bar holds before the labels start
 * truncating on a narrow phone.
 */
export const TAB_SLOTS = 4;

/** `/folders` must not light up for `/foldersomething`, hence the trailing slash. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
