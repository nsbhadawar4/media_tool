'use client';

import { useId } from 'react';
import { cn } from '@/utils/cn';

interface FolderIconProps {
  /**
   * Draws sheets peeking out from behind the front panel — the cue a desktop file manager
   * gives a folder that isn't empty. Drop it at small sizes, where the detail turns to mud.
   */
  hasContents?: boolean;
  className?: string;
}

/**
 * The app's folder mark.
 *
 * Lucide's `FolderClosed` is a 2px outline drawn to sit inline next to text; blown up to
 * tile size it reads as a wireframe rather than an object. This is a solid, tabbed folder
 * — a darker back panel behind a lighter front one — which is what makes it read as a
 * container that holds things at a glance.
 *
 * The colours are literal rather than theme tokens on purpose. A folder is one recognisable
 * object in both themes, exactly as it is on a desktop, and these mid-tones carry enough
 * contrast against both the light and the dark surface. Everything *around* the mark still
 * comes from the theme. Lucide remains the icon set everywhere else; this is the single
 * piece of app iconography that is filled rather than stroked, because it is the one mark
 * that has to work at 64px.
 */
export function FolderIcon({ hasContents = false, className }: FolderIconProps) {
  // Gradient ids have to be unique per instance: a grid renders dozens of these at once,
  // and duplicate ids make every folder after the first resolve to the wrong gradient.
  const uid = useId();
  const frontId = `folder-front-${uid}`;
  const backId = `folder-back-${uid}`;

  return (
    <svg
      viewBox="0 0 48 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      // Every folder mark in the app sits next to that folder's name, so announcing it
      // again would only repeat what the label already says.
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={backId} x1="24" y1="4" x2="24" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E9A83A" />
          <stop offset="1" stopColor="#D08E1C" />
        </linearGradient>
        <linearGradient id={frontId} x1="24" y1="15" x2="24" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FBCB72" />
          <stop offset="1" stopColor="#EFA62C" />
        </linearGradient>
      </defs>

      {/* Back panel, including the tab that makes the silhouette read as a folder. */}
      <path
        d="M4 7.5A3.5 3.5 0 0 1 7.5 4h10.3a3.5 3.5 0 0 1 2.8 1.4l2.3 3.1h17.6A3.5 3.5 0 0 1 44 12v20.5a3.5 3.5 0 0 1-3.5 3.5h-33A3.5 3.5 0 0 1 4 32.5Z"
        fill={`url(#${backId})`}
      />

      {hasContents && (
        <>
          <rect x="13" y="9.6" width="22" height="12" rx="2" fill="#FFFFFF" opacity="0.6" />
          <rect x="10.4" y="11.8" width="27.2" height="10" rx="2" fill="#FFFFFF" />
        </>
      )}

      {/* Front panel, set low enough that any sheets behind it stay visible. */}
      <path
        d="M4 18.5A3.5 3.5 0 0 1 7.5 15h33a3.5 3.5 0 0 1 3.5 3.5v14a3.5 3.5 0 0 1-3.5 3.5h-33A3.5 3.5 0 0 1 4 32.5Z"
        fill={`url(#${frontId})`}
      />
    </svg>
  );
}
