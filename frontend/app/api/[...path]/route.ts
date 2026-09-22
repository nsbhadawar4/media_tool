import type { Express } from 'express';
import { handleWithExpress } from '@/lib/server/expressBridge';

/**
 * The entire backend API, as one Vercel Function.
 *
 * Vercel builds one framework per project, so an Express app cannot be deployed beside
 * a Next.js app in the same project as a separate function. Mounting it here instead
 * keeps the whole thing on a single domain: the browser calls `/api/...` on the origin
 * it loaded the app from, which means first-party cookies and no CORS at all.
 *
 * Nothing about the API is defined in this file. Routing, validation, authentication and
 * error handling all live in `backend/src` and are equally the app that `npm run dev`
 * starts on port 5000 — this is a second way in, not a second implementation.
 */

// Express needs real Node APIs; this can never run on the Edge runtime.
export const runtime = 'nodejs';

// Every route here is authenticated and per-user. Caching or statically analysing any
// of it would be wrong, and a build-time attempt to render it would need a database.
export const dynamic = 'force-dynamic';

/**
 * Well above what a JSON request needs, and deliberately so: thumbnail generation for a
 * direct upload pulls the stored object back out of the bucket, which is the slowest
 * thing this function does.
 */
export const maxDuration = 60;

/**
 * Built once per instance and reused across invocations on that instance.
 *
 * The promise is cached rather than the app, so several requests arriving on a cold
 * instance all await the same startup instead of each building their own app and
 * opening their own database pool.
 */
let appPromise: Promise<Express> | null = null;

/**
 * Captured when the app is built so the handler can re-check the database on every
 * request. It has to be every request: this module scope survives between invocations,
 * but the instance is frozen in between and its sockets do not survive that — so an app
 * built once against a live connection goes on being reused against a dead one.
 *
 * Mongoose buffers model queries through a reconnect, which hid this for everything that
 * reads documents. GridFS does not: it talks to the driver directly, so a file read fails
 * outright, and a PDF that opens perfectly in development reports itself unavailable in
 * production whenever the instance serving it had been idle.
 *
 * The check itself is one integer comparison when the connection is up (see
 * connectDatabaseOnce), so this costs nothing in the case that matters.
 */
let ensureDatabase: (() => Promise<void>) | null = null;

function getApp(): Promise<Express> {
  if (!appPromise) {
    appPromise = startApp().catch((err: unknown) => {
      // Clear the cache so the next request retries, rather than every later request on
      // this instance being handed the same rejected promise forever.
      appPromise = null;
      throw err;
    });
  }
  return appPromise;
}

/**
 * Imported here rather than at the top of the file on purpose.
 *
 * The backend validates its environment the moment it is loaded, and Next.js imports
 * every route module during the build to read the configuration exported above. A static
 * import would therefore make `next build` fail unless the database URI and JWT secret
 * were present at build time — secrets a build has no business needing, and which are
 * not set during a typical CI or preview build at all. Deferring the import to the first
 * request keeps the build free of them and still costs nothing afterwards, since the
 * module and the app it returns are both cached above.
 */
async function startApp(): Promise<Express> {
  const [{ createApp }, database] = await Promise.all([
    import('media-tool-backend'),
    import('media-tool-backend/database'),
  ]);

  ensureDatabase = database.connectDatabaseOnce;
  await ensureDatabase();
  return createApp();
}

async function handler(request: Request): Promise<Response> {
  const app = await getApp();

  try {
    await ensureDatabase!();
  } catch {
    /**
     * Answered here rather than by letting this throw. An unhandled error in a Route
     * Handler becomes Next.js's own HTML error page, and this route is what serves files:
     * an `<img>` or a PDF viewer would receive a web page where bytes were expected, and
     * a download would write that page to disk under the document's name. A JSON 503 is
     * both true and something the client can read.
     */
    return Response.json(
      {
        success: false,
        message: 'The database is unavailable, so this request could not be served.',
        error: { message: 'The database is unavailable, so this request could not be served.' },
      },
      { status: 503 },
    );
  }

  return handleWithExpress(app, request);
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as HEAD,
  handler as OPTIONS,
};
