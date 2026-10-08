import { BookOpenCheck, Gamepad2, GraduationCap, LayoutTemplate, Library, Puzzle, Shapes, type LucideIcon } from 'lucide-react';
import type { ContentType } from '@/lib/api/adminContent';

/** The admin content sections, their URLs and how they're described. */
export interface ContentTypeInfo {
  type: ContentType;
  /** URL segment under /admin/content. */
  slug: string;
  label: string;
  singular: string;
  icon: LucideIcon;
  description: string;
  /** What "visible" and "enabled" mean for this kind of entry, in the editor's words. */
  visibleHint: string;
  enabledHint: string;
}

export const CONTENT_TYPES: readonly ContentTypeInfo[] = [
  {
    type: 'section',
    slug: 'sections',
    label: 'Website sections',
    singular: 'section',
    icon: LayoutTemplate,
    description: 'The public home page: which sections show, and in what order.',
    visibleHint: 'Shown on the home page',
    enabledHint: 'Can be shown at all',
  },
  {
    type: 'class',
    slug: 'classes',
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
    type: 'kid_game',
    slug: 'games',
    label: 'Games',
    singular: 'game',
    icon: Puzzle,
    description: 'Educational games, by class, subject and course: titles, order, course and availability.',
    visibleHint: 'Listed to children',
    enabledHint: 'Can be played (results count)',
  },
  {
    type: 'game',
    slug: 'arcade',
    label: 'Arcade games',
    singular: 'arcade game',
    icon: Gamepad2,
    description: 'The arcade and multiplayer games on the Games page.',
    visibleHint: 'Listed on the Games page',
    enabledHint: 'Can be opened and played',
  },
];

export const COURSES_INFO = {
  slug: 'courses',
  label: 'Courses',
  icon: BookOpenCheck,
  description: 'Learning content for a class and subject: lessons, and the games that practise them.',
};

export const OVERVIEW_ICON = Shapes;

export function contentTypeBySlug(slug: string): ContentTypeInfo | undefined {
  return CONTENT_TYPES.find((t) => t.slug === slug);
}
