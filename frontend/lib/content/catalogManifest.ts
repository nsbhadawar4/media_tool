import { ALL_GAMES, CLASS_INFO, CLASS_LEVELS, SUBJECTS, SUBJECT_INFO } from '../kid-games/catalog';
import { GAMES } from '../../components/games/games';

/**
 * The content the frontend *code* implements, as catalog entries: what the database catalog is
 * seeded from (scripts/export-catalog.ts), and what counts as "implemented" — an entry an
 * administrator adds without matching code here can be managed but not shown to users.
 *
 * Relative imports only: this file is also run by the export script outside Next.js.
 */

export type ContentType = 'section' | 'class' | 'subject' | 'class_subject' | 'kid_game' | 'game';

export interface ManifestEntry {
  type: ContentType;
  key: string;
  title: string;
  description: string;
  order: number;
  classLevel?: number;
  subject?: string;
  isVisible?: boolean;
  /** Kid Games: fixed by the game's content in code. */
  difficulty?: 'easy' | 'medium' | 'hard';
  gameType?: string;
}

/** The key of a class ↔ subject link: "class-2-math". */
export const classSubjectKey = (classLevel: number, subject: string) => `class-${classLevel}-${subject}`;

interface SectionSeed {
  key: string;
  title: string;
  description: string;
  /**
   * Position among the sections. Only used when the section is first added to a database, so a
   * section added in a later release lands where it belongs among ones that already exist (whose
   * order an administrator may since have changed) — hence the fractions.
   */
  order: number;
  isVisible?: boolean;
}

/** The public home page's sections, in page order. */
export const HOME_SECTIONS: ReadonlyArray<SectionSeed> = [
  { key: 'hero', title: 'Hero', description: 'Headline, introduction and the main call to action.', order: 1 },
  { key: 'highlights', title: 'Product highlights', description: 'Photos, videos, documents, folders and games at a glance.', order: 1.5 },
  { key: 'features', title: 'Features', description: 'What media_tool does, at a glance.', order: 2 },
  { key: 'media', title: 'Media library', description: 'Photos and videos section.', order: 3 },
  { key: 'documents', title: 'Documents', description: 'Documents and in-app previews.', order: 4 },
  { key: 'games', title: 'Games', description: 'The games collection.', order: 5 },
  { key: 'kid-games', title: 'Kid Games', description: 'Learning games for Classes 1–5.', order: 6 },
  { key: 'how-it-works', title: 'How it works', description: 'Three steps from sign-up to your library.', order: 6.4 },
  { key: 'security', title: 'Security & privacy', description: 'How accounts and files are kept private.', order: 6.7 },
  { key: 'reviews', title: 'Reviews', description: 'Approved public reviews.', order: 7 },
  // Hidden from the home page on request; plans are chosen during onboarding.
  { key: 'pricing', title: 'Pricing', description: 'Free, Pro and Premium plans.', order: 8, isVisible: false },
  { key: 'faq', title: 'FAQ', description: 'Frequently asked questions.', order: 9 },
  { key: 'cta', title: 'Final call to action', description: 'Closing sign-up prompt.', order: 10 },
];

/** Public sections that aren't a home page block: pages of their own, linked from the site. */
export const SITE_SECTIONS: ReadonlyArray<SectionSeed> = [
  { key: 'contact', title: 'Contact', description: 'The Contact page: support email and help links.', order: 11 },
];

export function buildCatalogSeed(): ManifestEntry[] {
  const sections = [...HOME_SECTIONS, ...SITE_SECTIONS].map((s): ManifestEntry => ({
    type: 'section',
    key: s.key,
    title: s.title,
    description: s.description,
    order: s.order,
    ...(s.isVisible === false ? { isVisible: false } : {}),
  }));
  const classes = CLASS_LEVELS.map((level): ManifestEntry => ({
    type: 'class',
    key: CLASS_INFO[level].slug,
    title: `Class ${level}`,
    description: CLASS_INFO[level].tagline,
    order: level,
    classLevel: level,
  }));
  const subjects = SUBJECTS.map((subject, i): ManifestEntry => ({
    type: 'subject',
    key: subject,
    title: SUBJECT_INFO[subject].name,
    description: SUBJECT_INFO[subject].native,
    order: i + 1,
  }));
  // Every class offers every subject today; each link can be switched off on its own.
  const classSubjects = CLASS_LEVELS.flatMap((level) =>
    SUBJECTS.map((subject, i): ManifestEntry => ({
      type: 'class_subject',
      key: classSubjectKey(level, subject),
      title: `Class ${level} · ${SUBJECT_INFO[subject].name}`,
      description: CLASS_INFO[level].focus[subject],
      order: i + 1,
      classLevel: level,
      subject,
    })),
  );
  const kidGames = ALL_GAMES.map((game): ManifestEntry => ({
    type: 'kid_game',
    key: game.id,
    title: game.title,
    description: game.description,
    order: game.index + 1,
    classLevel: game.classLevel,
    subject: game.subject,
    difficulty: game.difficulty,
    gameType: game.engine,
  }));
  const games = GAMES.map((game, i): ManifestEntry => ({
    type: 'game',
    key: game.slug,
    title: game.name,
    description: game.description,
    order: i + 1,
  }));
  return [...sections, ...classes, ...subjects, ...classSubjects, ...kidGames, ...games];
}

/** "type:key" for every entry the code implements. */
export const IMPLEMENTED_KEYS: ReadonlySet<string> = new Set(buildCatalogSeed().map((e) => `${e.type}:${e.key}`));

export function isImplemented(type: ContentType, key: string): boolean {
  return IMPLEMENTED_KEYS.has(`${type}:${key}`);
}
