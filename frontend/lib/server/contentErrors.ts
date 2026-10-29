/**
 * Thrown by a public course page when its content could not be read for a reason that is not "this
 * isn't there" (a database that can't be reached, a bug). It is deliberately an error, not a rendered
 * message: an error reaches Next.js's error boundary (app/classes/error.tsx) before anything has been
 * streamed, so the response carries a real 500 status — a monitor, a crawler or a CDN can tell it from
 * a good page — while the visitor still sees the friendly state with a retry. The cause itself has
 * already been logged by the reader (lib/server/contentCatalog.ts); the message here never reaches the
 * browser in production.
 */
export class ContentUnavailableError extends Error {
  constructor(readonly what: 'class' | 'subject' | 'chapter') {
    super(`Public ${what} content could not be read`);
    this.name = 'ContentUnavailableError';
  }
}
