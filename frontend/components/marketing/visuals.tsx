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

/*
 * Detailed scenes for the Media section's collage. Each is drawn once on a page, so its gradient
 * ids are fixed (prefixed `ms-` so they never meet another illustration's).
 */
const SCENE_SVG = 'block h-full w-full';

/** Snow-capped mountains under a purple-to-orange sunset sky. */
export function MountainSunsetArt({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" className={cn(SCENE_SVG, className)}>
      <defs>
        <linearGradient id="ms-sun-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6d28d9" />
          <stop offset="0.45" stopColor="#c084fc" />
          <stop offset="0.8" stopColor="#fb923c" />
          <stop offset="1" stopColor="#fdba74" />
        </linearGradient>
        <linearGradient id="ms-sun-peak" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f97316" />
          <stop offset="0.5" stopColor="#be185d" />
          <stop offset="1" stopColor="#4c1d95" />
        </linearGradient>
        <linearGradient id="ms-sun-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b2a6b" />
          <stop offset="1" stopColor="#1e1b4b" />
        </linearGradient>
      </defs>
      <rect width="400" height="260" fill="url(#ms-sun-sky)" />
      <ellipse cx="90" cy="70" rx="70" ry="10" fill="#fdf4ff" opacity="0.25" />
      <ellipse cx="310" cy="50" rx="60" ry="8" fill="#fdf4ff" opacity="0.2" />
      <path d="M0 170 L60 130 L110 150 L160 110 L200 70 L235 105 L270 90 L320 130 L360 115 L400 140 L400 260 L0 260 Z" fill="url(#ms-sun-peak)" />
      <path d="M200 70 L184 86 L194 84 L200 92 L208 84 L218 90 Z" fill="#fff7ed" opacity="0.9" />
      <path d="M270 90 L260 100 L268 99 L274 104 L282 98 Z" fill="#fff7ed" opacity="0.75" />
      <path d="M0 200 L70 165 L130 185 L190 150 L250 180 L310 160 L400 190 L400 260 L0 260 Z" fill="#5b21b6" opacity="0.85" />
      <path d="M0 230 L80 205 L160 222 L240 200 L320 220 L400 210 L400 260 L0 260 Z" fill="url(#ms-sun-near)" />
    </svg>
  );
}

/** A waterfall dropping between green, mossy cliffs. */
export function WaterfallArt({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" className={cn(SCENE_SVG, className)}>
      <defs>
        <linearGradient id="ms-fall-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bbf7d0" />
          <stop offset="1" stopColor="#166534" />
        </linearGradient>
        <linearGradient id="ms-fall-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0f9ff" />
          <stop offset="1" stopColor="#bae6fd" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" fill="url(#ms-fall-bg)" />
      {/* Distant foliage */}
      <circle cx="20" cy="30" r="36" fill="#4ade80" opacity="0.7" />
      <circle cx="185" cy="25" r="40" fill="#22c55e" opacity="0.7" />
      <circle cx="100" cy="10" r="30" fill="#86efac" opacity="0.6" />
      {/* Cliffs */}
      <path d="M0 50 L70 45 L82 200 L0 200 Z" fill="#3f4a3c" />
      <path d="M128 40 L200 46 L200 200 L120 200 Z" fill="#374236" />
      <path d="M0 50 L70 45 L72 62 L0 70 Z" fill="#16a34a" />
      <path d="M128 40 L200 46 L200 64 L126 58 Z" fill="#15803d" />
      <path d="M10 110 L60 100 L64 118 L8 126 Z" fill="#22c55e" opacity="0.85" />
      <path d="M140 120 L196 112 L198 130 L138 136 Z" fill="#16a34a" opacity="0.85" />
      {/* Water */}
      <path d="M78 46 L126 42 L122 170 L84 170 Z" fill="url(#ms-fall-water)" />
      <path d="M90 48 L92 168 M102 46 L103 168 M114 45 L112 168" stroke="#ffffff" strokeWidth="2" opacity="0.7" />
      <ellipse cx="103" cy="172" rx="44" ry="10" fill="#f0f9ff" opacity="0.9" />
      <path d="M0 176 Q100 166 200 178 L200 200 L0 200 Z" fill="#0e7490" opacity="0.85" />
      <circle cx="40" cy="186" r="14" fill="#166534" />
      <circle cx="170" cy="188" r="16" fill="#14532d" />
    </svg>
  );
}

/** Rolling green hills under a pale blue sky. */
export function GreenHillsArt({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 400 180" preserveAspectRatio="xMidYMid slice" className={cn(SCENE_SVG, className)}>
      <defs>
        <linearGradient id="ms-hill-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7dd3fc" />
          <stop offset="1" stopColor="#e0f2fe" />
        </linearGradient>
        <linearGradient id="ms-hill-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4ade80" />
          <stop offset="1" stopColor="#15803d" />
        </linearGradient>
      </defs>
      <rect width="400" height="180" fill="url(#ms-hill-sky)" />
      <ellipse cx="300" cy="40" rx="50" ry="9" fill="#ffffff" opacity="0.8" />
      <ellipse cx="90" cy="30" rx="40" ry="7" fill="#ffffff" opacity="0.7" />
      <path d="M0 110 Q80 70 160 100 T320 85 T400 95 L400 180 L0 180 Z" fill="#86efac" />
      <path d="M0 130 Q100 90 200 120 T400 110 L400 180 L0 180 Z" fill="#22c55e" />
      <path d="M0 155 Q120 120 240 148 T400 140 L400 180 L0 180 Z" fill="url(#ms-hill-near)" />
    </svg>
  );
}

/** A night sky with the Milky Way over dark mountains. */
export function NightSkyArt({ className }: { className?: string }) {
  const stars: ReadonlyArray<readonly [number, number, number]> = [
    [20, 20, 1.2], [48, 44, 0.8], [70, 14, 1], [95, 58, 0.7], [120, 26, 1.3], [150, 12, 0.8], [176, 40, 1],
    [30, 80, 0.7], [160, 76, 0.9], [110, 92, 0.6], [62, 104, 0.8], [188, 100, 0.7], [12, 120, 0.9], [140, 118, 0.6],
  ];
  return (
    <svg aria-hidden viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" className={cn(SCENE_SVG, className)}>
      <defs>
        <linearGradient id="ms-night-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e1b4b" />
          <stop offset="0.6" stopColor="#4c1d95" />
          <stop offset="1" stopColor="#7e22ce" />
        </linearGradient>
        <linearGradient id="ms-night-way" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#f0abfc" stopOpacity="0" />
          <stop offset="0.5" stopColor="#f5d0fe" stopOpacity="0.55" />
          <stop offset="1" stopColor="#f0abfc" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" fill="url(#ms-night-sky)" />
      <path d="M10 170 Q90 110 190 20 L200 40 Q110 130 30 185 Z" fill="url(#ms-night-way)" />
      {stars.map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#ffffff" opacity="0.9" />
      ))}
      <path d="M0 160 L40 130 L70 150 L110 118 L150 148 L200 128 L200 200 L0 200 Z" fill="#2e1065" />
      <path d="M0 180 L50 160 L100 176 L150 158 L200 172 L200 200 L0 200 Z" fill="#170b3b" />
    </svg>
  );
}
