/**
 * In-page sections of the public site, in the order they appear. A plain module (not the
 * 'use client' header) so server components such as the footer can read the array itself —
 * importing it from a client module would hand them a client reference instead.
 *
 * `/#section` rather than `#section` so the links also work from /privacy, /terms and /contact.
 */
export const MARKETING_NAV = [
  { href: '/#top', label: 'Home' },
  { href: '/#features', label: 'Features' },
  { href: '/#games', label: 'Games' },
  { href: '/#kid-games', label: 'Kid Games' },
  { href: '/#faq', label: 'FAQ' },
] as const;
