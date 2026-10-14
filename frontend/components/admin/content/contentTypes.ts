import { BookOpenCheck, Gamepad2, GraduationCap, LayoutDashboard, LayoutTemplate, Library, Navigation, Puzzle, Shapes, type LucideIcon } from 'lucide-react';
import type { ContentType } from '@/lib/api/adminContent';

/** The admin content sections, their URLs and how they're described. */
export interface ContentTypeInfo {
  type: ContentType;
  /** URL segment under /admin/content. */
  slug: string;
  /** Where its page lives when that isn't /admin/content/{slug} (classes: Manage Courses). */
  href?: string;
  label: string;
  singular: string;
  icon: LucideIcon;
  description: string;
  /** What "visible" and "enabled" mean for this kind of entry, in the editor's words. */
  visibleHint: string;
  enabledHint: string;
  /** The column name for "visible" (games: their place in the signed-in app). */
  visibleLabel?: string;
  /**
   * Games and Kid Games: the feature (website section) they belong to. Their screens get the
   * feature's master / landing / dashboard switches, the landing and featured switches per game,
   * and bulk changes.
   */
  feature?: 'games' | 'kid-games';
}

export const CONTENT_TYPES: readonly ContentTypeInfo[] = [
  {
    type: 'section',
    slug: 'sections',
    label: 'Landing page',
    singular: 'section',
    icon: LayoutTemplate,
    description: 'The public home page: which sections show, and in what order.',
    visibleHint: 'Shown on the home page',
    enabledHint: 'Can be shown at all',
  },
  {
    type: 'dashboard_widget',
    slug: 'dashboard',
    label: 'User dashboard',
    singular: 'dashboard block',
    icon: LayoutDashboard,
    description: 'The blocks of every signed-in user’s dashboard: which show, and in what order.',
    visibleHint: 'Shown on the dashboard',
    enabledHint: 'Shown on the dashboard',
  },
  {
    type: 'game',
    slug: 'games',
    label: 'Games',
    singular: 'game',
    icon: Gamepad2,
    description: 'The arcade and multiplayer games: whether each can be played, where it is shown, and in what order.',
    visibleHint: 'Listed for signed-in users: the dashboard and the Games page',
    enabledHint: 'Can be opened and played (off: a direct link says it is unavailable)',
    visibleLabel: 'Dashboard',
    feature: 'games',
  },
  {
    type: 'kid_game',
    slug: 'kid-games',
    label: 'Kid Games',
    singular: 'Kid Game',
    icon: Puzzle,
    description: 'Educational games, by class, subject and course: availability, where they are shown, titles and order.',
    visibleHint: 'Listed to children: the dashboard and the Kid Games pages',
    enabledHint: 'Can be played (results count)',
    visibleLabel: 'Dashboard',
    feature: 'kid-games',
  },
  {
    type: 'class',
    slug: 'classes',
    href: '/admin/courses',
    label: 'Classes',
    singular: 'class',
    icon: GraduationCap,
    description: 'Learning classes. Switching a class off removes everything in it — subjects, courses and games — for users.',
    visibleHint: 'Listed in Kid Games',
    enabledHint: 'Open to users (with its subjects, courses and games)',
  },
  {
    type: 'subject',
    slug: 'subjects',
    label: 'Subjects',
    singular: 'subject',
    icon: Library,
    description: 'Learning subjects, and which classes offer each one. Switch a class’s subject off on its own in the table below.',
    visibleHint: 'Listed in Kid Games',
    enabledHint: 'Open to users in every class',
  },
  {
    type: 'nav_item',
    slug: 'navigation',
    label: 'Navigation',
    singular: 'navigation link',
    icon: Navigation,
    description: 'The public header’s links and buttons: which show, their labels and their order. Each one’s destination is fixed by the app.',
    visibleHint: 'Shown in the header',
    enabledHint: 'Shown in the header',
  },
];

export const COURSES_INFO = {
  slug: 'courses',
  label: 'Courses',
  icon: BookOpenCheck,
  description: 'Learning content for a class and subject: lessons, and the games that practise them.',
};

export const OVERVIEW_ICON = Shapes;

/** Earlier addresses of the same screens, still accepted. */
const ALIASES: Record<string, string> = { arcade: 'games' };

export function contentTypeBySlug(slug: string): ContentTypeInfo | undefined {
  const target = ALIASES[slug] ?? slug;
  return CONTENT_TYPES.find((t) => t.slug === target);
}

/** Classes and subjects sit next to Courses in the switcher; the rest come first. */
export const NAV_ORDER: readonly string[] = ['sections', 'dashboard', 'games', 'kid-games', 'classes', 'subjects', 'courses', 'navigation'];
