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
  const [{ createApp }, { connectDatabaseOnce }] = await Promise.all([
    import('media-tool-backend'),
    import('media-tool-backend/database'),
  ]);

  await connectDatabaseOnce();
  return createApp();
}

async function handler(request: Request): Promise<Response> {
  const app = await getApp();
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
