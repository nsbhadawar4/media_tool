import { cn } from '@/utils/cn';

/**
 * The app's mark, drawn inline.
 *
 * Inline rather than an `<img>` pointing at the SVG: it appears in the sidebar, the top bar
 * and the sign-in card — three places that render before anything else — and a separate
 * request for each would show an empty square first. It is also the one piece of the UI
 * that must never flash a placeholder, since it is what says which app this is.
 *
 * Kept in step with public/brand/logo-mark.svg by hand, which is a short file that changes
 * rarely; that file remains the source the icons are rasterised from
 * (scripts/generate-brand-assets.mjs).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn('h-8 w-8', className)}
      role="img"
      aria-label="media_tool"
      focusable="false"
    >
      <defs>
        {/*
          Scoped to this instance. Several logos can be on one page — the sidebar's and the
          top bar's overlap during a viewport change — and a shared gradient id would have
          whichever mounted last silently claim the other's fill.
        */}
        <linearGradient id="logo-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8B7BFF" />
          <stop offset="0.55" stopColor="#6D5EF8" />
          <stop offset="1" stopColor="#5B4CE8" />
        </linearGradient>
      </defs>

      <rect width="64" height="64" rx="15" fill="url(#logo-tile)" />
      <rect x="21" y="12.5" width="22" height="4" rx="2" fill="#FFFFFF" opacity="0.4" />
      <rect x="16" y="18" width="32" height="4" rx="2" fill="#FFFFFF" opacity="0.65" />
      <rect x="11" y="24" width="42" height="27" rx="6" fill="#FFFFFF" />
      <path d="M26.3 31 L26.3 44 L37.8 37.5 Z" fill="#5B4CE8" />
    </svg>
  );
}
