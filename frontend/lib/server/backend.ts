/**
 * The compiled backend, loaded once per server process and shared by everything in it that needs it:
 * the /api bridge (Express) and the server-rendered pages (in-process content reads).
 *
 * A page and the /api route are bundled separately, and two copies of the backend in one process clash
 * on their shared Mongoose models. The loader's promise is therefore kept on globalThis, not in module
 * scope: whichever bundle asks first loads the backend, and every other caller gets that same instance
 * — one set of models, one database connection, one content cache (an admin change clears it for both).
 *
 * Imported lazily, on first use, never at the top of a module: the backend validates its environment
 * the moment it loads, and `next build` must not need the database URI or the JWT secret.
 */
export interface Backend {
  createApp: typeof import('media-tool-backend').createApp;
  setBackgroundRunner: typeof import('media-tool-backend').setBackgroundRunner;
  runTracked: typeof import('media-tool-backend').runTracked;
  /** Resolves once the database connection is up (a no-op when it already is); rejects when it cannot be reached. */
  ensureDatabase: typeof import('media-tool-backend/database').connectDatabaseOnce;
  publicContent: typeof import('media-tool-backend/publicContent').publicContent;
}

const KEY = Symbol.for('media-tool.backend');
type Holder = { [KEY]?: Promise<Backend> };

export function loadBackend(): Promise<Backend> {
  const holder = globalThis as Holder;
  if (!holder[KEY]) {
    holder[KEY] = (async (): Promise<Backend> => {
      const [app, database, content] = await Promise.all([
        import('media-tool-backend'),
        import('media-tool-backend/database'),
        import('media-tool-backend/publicContent'),
      ]);
      return {
        createApp: app.createApp,
        setBackgroundRunner: app.setBackgroundRunner,
        runTracked: app.runTracked,
        ensureDatabase: database.connectDatabaseOnce,
        publicContent: content.publicContent,
      };
    })().catch((err: unknown) => {
      // A failed start is not remembered: the next request tries again.
      holder[KEY] = undefined;
      throw err;
    });
  }
  return holder[KEY]!;
}
