/** Breadcrumbs for the admin area and the user application (a pure module, testable outside Next.js). */

/** Readable names for the admin routes; ids and unknown segments get a generic label. */
const LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  users: 'Users',
  activity: 'User activity',
  reviews: 'Reviews',
  content: 'Content',
  sections: 'Website sections',
  classes: 'Classes',
  subjects: 'Subjects',
  courses: 'Courses',
  games: 'Educational games',
  arcade: 'Arcade games',
  settings: 'Settings',
  new: 'New course',
};

/** The crumb for a dynamic segment (an id), named after what its parent lists. */
const DETAIL: Record<string, string> = { users: 'User details', courses: 'Edit course' };

export interface Crumb {
  label: string;
  href: string;
}

/** "/admin/content/courses/abc" → Admin › Content › Courses › Edit course. Exported for tests. */
export function adminCrumbs(pathname: string): Crumb[] {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'admin') return [];
  const crumbs: Crumb[] = [{ label: 'Admin', href: '/admin/dashboard' }];
  let href = '/admin';
  for (let i = 1; i < parts.length; i++) {
    const segment = parts[i];
    href += `/${segment}`;
    crumbs.push({ label: LABELS[segment] ?? DETAIL[parts[i - 1]] ?? 'Details', href });
  }
  return crumbs;
}

/** Top-level pages of the user application. */
const USER_SECTIONS: Record<string, string> = {
  dashboard: 'Dashboard',
  folders: 'Folders',
  media: 'Media',
  documents: 'Documents',
  games: 'Games',
  'kid-games': 'Kid Games',
  courses: 'Courses',
  profile: 'Profile',
  settings: 'Settings',
  'manage-storage': 'Storage',
  trash: 'Trash',
  activity: 'Activity',
};

const SUBJECT_NAMES: Record<string, string> = { math: 'Mathematics', hindi: 'Hindi', english: 'English' };

/** "memory-match" → "Memory Match", "class-2" → "Class 2". */
const titleCase = (slug: string) => slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * The user application's trail: Library › Media, Library › Kid Games › Class 1 › Mathematics,
 * Library › Games › Memory Match. Names come from the address only (no data is fetched): a
 * folder is "Folder" here — the folder page shows its own path with real names.
 */
export function userCrumbs(pathname: string): Crumb[] {
  const parts = pathname.split('/').filter(Boolean);
  const section = parts[0];
  if (!section || !(section in USER_SECTIONS)) return [];
  const crumbs: Crumb[] = [{ label: 'Library', href: '/dashboard' }];
  if (section === 'dashboard') return [...crumbs, { label: 'Dashboard', href: '/dashboard' }];
  let href = `/${section}`;
  crumbs.push({ label: USER_SECTIONS[section], href });
  for (let i = 1; i < parts.length; i++) {
    const segment = parts[i];
    href += `/${segment}`;
    let label: string;
    if (section === 'folders') label = 'Folder';
    else if (section === 'kid-games' && i === 2) label = SUBJECT_NAMES[segment] ?? titleCase(segment);
    else if (section === 'kid-games' && i === 3) label = 'Game';
    else label = titleCase(decodeURIComponent(segment));
    crumbs.push({ label, href });
  }
  return crumbs;
}
