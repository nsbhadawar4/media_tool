import { cn } from '@/utils/cn';

/**
 * Illustrations for the public website, drawn with SVG and CSS in the app's own visual language
 * (no stock images, nothing to download). They are decorative: every caller marks them
 * aria-hidden, and nothing in them is data — no counts, no real files.
 */

/** Palettes for the illustrated "photos": sky top, sky bottom, sun, far hills, near hills. */
const SCENES = [
  ['#2e1065', '#c026d3', '#fde68a', '#581c87', '#1e1b4b'],
  ['#0c4a6e', '#38bdf8', '#fef9c3', '#0f766e', '#064e3b'],
  ['#7c2d12', '#fb923c', '#fff7ed', '#9a3412', '#431407'],
  ['#1e1b4b', '#6366f1', '#e0e7ff', '#312e81', '#0f0a2e'],
  ['#831843', '#f472b6', '#fdf2f8', '#9d174d', '#500724'],
  ['#14532d', '#4ade80', '#fefce8', '#166534', '#052e16'],
] as const;

/** A small landscape "photo": gradient sky, a sun and two layers of hills. */
export function PhotoArt({ scene = 0, className }: { scene?: number; className?: string }) {
  const [top, bottom, sun, far, near] = SCENES[scene % SCENES.length];
  // The sky is a CSS gradient (an SVG gradient would need an id, repeated wherever a scene is).
  return (
    <div aria-hidden className={cn('h-full w-full', className)} style={{ backgroundImage: `linear-gradient(180deg, ${top}, ${bottom})` }}>
      <svg viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" className="block h-full w-full">
        <circle cx={30 + (scene % 3) * 28} cy="34" r="11" fill={sun} opacity="0.92" />
        <path d="M0 62 L22 46 L40 56 L62 38 L84 54 L104 44 L120 52 L120 90 L0 90 Z" fill={far} opacity="0.9" />
        <path d="M0 74 L18 64 L42 72 L66 60 L92 70 L120 62 L120 90 L0 90 Z" fill={near} />
      </svg>
    </div>
  );
}
