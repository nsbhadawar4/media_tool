import {
  Activity,
  Archive,
  BarChart3,
  BookOpenCheck,
  FileText,
  FolderClosed,
  FolderTree,
  Gamepad2,
  GraduationCap,
  HardDrive,
  Image as ImageIcon,
  LayoutDashboard,
  LayoutTemplate,
  Library,
  type LucideIcon,
  Navigation,
  NotebookPen,
  Puzzle,
  Settings,
  Shapes,
  Star,
  Trash2,
  UserRound,
  Users,
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
  /** Lit only on this exact path, not below it (an overview whose sub-pages have their own entries). */
  exact?: boolean;
  /**
   * Makes this entry an expandable parent (e.g. Storage Management). The parent is itself a link to
   * its own `href` (its overview page, which is also its first child) plus a chevron that opens or
   * closes the children. Desktop and the mobile drawer render the children nested; the mobile tab
   * bar lists them flat, without the parent (see liveNavItems).
   */
  children?: readonly NavItem[];
}

export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

/**
 * The storage pages, grouped under one expandable parent for users and administrators alike. A
 * navigation grouping only: every page keeps its own route (the parent reuses /manage-storage).
 */
const STORAGE_MANAGEMENT: NavItem = {
  // The parent opens the overview (/manage-storage); the children are the pages it leads to.
  href: '/manage-storage', label: 'Storage Management', icon: FolderTree,
  children: [
    { href: '/manage-storage', label: 'Storage', icon: HardDrive },
    { href: '/folders', label: 'Folders', icon: FolderClosed },
    { href: '/media', label: 'Media', icon: ImageIcon },
    { href: '/documents', label: 'Documents', icon: FileText },
  ],
};

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
      STORAGE_MANAGEMENT,
      // Courses follow Manage Courses alone: never hidden by the Kid Games switch.
      { href: '/courses', label: 'Courses', icon: BookOpenCheck },
      { href: '/games', label: 'Games', icon: Gamepad2, section: 'games' },
      { href: '/kid-games', label: 'Kid Games', icon: GraduationCap, section: 'kid-games' },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/profile', label: 'Profile', icon: UserRound },
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
      // The classes (with their subjects) on the website, the user dashboard and Kid Games.
      { href: '/admin/courses', label: 'Manage Courses', icon: GraduationCap },
      // Hand-written courses (chapters, lessons, questions) — independent of the AI Course Generator.
      { href: '/admin/manual-courses', label: 'Manual Courses', icon: NotebookPen },
      { href: '/admin/activity', label: 'User activity', icon: Activity },
      { href: '/admin/reviews', label: 'Reviews', icon: Star },
      // Shared with the user app: an administrator's own files live in the same library pages
      // (see ADMIN_LIBRARY_PATH), so these are the existing routes, not /admin copies.
      STORAGE_MANAGEMENT,
    ],
  },
  {
    // Two separate places: what was intentionally archived, and what was deleted (restorable until
    // deleted forever). Classes, subjects, courses, chapters, Kid Games, games and sections.
    label: 'Content management',
    items: [
      { href: '/admin/archive', label: 'Archive', icon: Archive },
      { href: '/admin/trash', label: 'Trash / Deleted', icon: Trash2 },
    ],
  },
  {
    // The content-management pages (one per kind of entry), plus their overview.
    label: 'Website & content',
    items: [
      { href: '/admin/content', label: 'Content overview', icon: Shapes, exact: true },
      { href: '/admin/content/sections', label: 'Landing page', icon: LayoutTemplate },
      { href: '/admin/content/dashboard', label: 'User dashboard', icon: LayoutDashboard },
      { href: '/admin/content/games', label: 'Games', icon: Gamepad2 },
      { href: '/admin/content/kid-games', label: 'Kid Games', icon: Puzzle },
      { href: '/admin/content/subjects', label: 'Subjects', icon: Library },
      { href: '/admin/content/courses', label: 'Lesson courses', icon: BookOpenCheck },
      { href: '/admin/content/navigation', label: 'Navigation', icon: Navigation },
    ],
  },
  {
    label: 'System',
    items: [{ href: '/admin/settings', label: 'Settings', icon: Settings }],
  },
];

/** The groups without areas whose website section is switched off. */
export function openNavGroups(groups: readonly NavGroup[], isSectionOn: (key: string) => boolean): NavGroup[] {
  const open = (items: readonly NavItem[]): NavItem[] =>
    items.filter((item) => !item.section || isSectionOn(item.section)).map((item) => (item.children ? { ...item, children: open(item.children) } : item));
  return groups.map((group) => ({ ...group, items: open(group.items) }));
}

/** Flat list of real pages in display order — what the mobile tab bar slices into tabs and "More". */
export function liveNavItems(groups: readonly NavGroup[]): NavItem[] {
  // A parent contributes its children (in place, so the order is the sidebar's), never itself.
  const flat = (items: readonly NavItem[]): NavItem[] => items.flatMap((item) => (item.children ? flat(item.children) : [item]));
  return flat(groups.flatMap((group) => group.items)).filter((item) => !item.planned);
}

/** A parent is "active" while any of its pages is open (the sidebar then keeps it expanded). */
export function isNavParentActive(pathname: string, item: NavItem): boolean {
  return (item.children ?? []).some((child) => !child.planned && isNavItemActive(pathname, child.href, child.exact));
}

/**
 * Four destinations plus "More" is the most a bottom bar holds before the labels start
 * truncating on a narrow phone.
 */
export const TAB_SLOTS = 4;

/** `/folders` must not light up for `/foldersomething`, hence the trailing slash. */
export function isNavItemActive(pathname: string, href: string, exact = false): boolean {
  return pathname === href || (!exact && pathname.startsWith(`${href}/`));
}
