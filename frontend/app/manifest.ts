import type { MetadataRoute } from 'next';

/**
 * Makes the app installable, and — through `display: 'standalone'` — makes it open without
 * the address bar and browser toolbars. That is the difference between something that runs
 * in a browser and something that behaves like an app on the home screen.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'media_tool — Private Media Library',
    short_name: 'media_tool',
    description: 'A private, self-hosted photo, video and document manager.',
    // Signed-out visitors are redirected to the sign-in page from here, so the installed
    // app always lands somewhere useful.
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    // Orientation is deliberately unlocked: a photo or a video is often worth turning the
    // phone for, and locking it to portrait would take that away.
    background_color: '#6D5EF8',
    theme_color: '#6D5EF8',
    categories: ['photo', 'productivity', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Kept separate from the `any` icons: Android crops maskable icons to the launcher's
      // shape, and the full-size glyph would lose its edges.
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
