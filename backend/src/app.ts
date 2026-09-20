import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { env } from './config/env';
import { mongoSanitize } from './middleware/sanitize';
import { apiRateLimiter } from './middleware/rateLimit';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';
import routes from './routes';

export function createApp(): Express {
  const app = express();

  /**
   * Decides which address req.ip reports when X-Forwarded-For is present. Left at the
   * default (false) the rate limiters would count every request against the proxy's own
   * address and throttle the whole deployment as one caller; set too permissively, a
   * caller could forge the header and hand themselves a fresh quota. TRUST_PROXY states
   * the real number of hops — see config/env.ts.
   */
  app.set('trust proxy', env.trustProxy);

  // Streaming endpoints set their own Content-Security-Policy-relevant headers;
  // disabling CSP here since this is a private JSON/media API, not an HTML-serving app.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  /**
   * CORS is only meaningful when the browser actually makes a cross-origin request. In
   * the single-project Vercel deployment the app and this API share an origin, so there
   * is nothing to negotiate and the middleware is left off entirely rather than
   * configured to allow something. Split-origin setups (local dev, or a separately
   * hosted API) still get the credentialed allow-list they need.
   */
  if (!env.isSameOrigin) {
    app.use(
      cors({
        origin: env.allowedOrigins,
        credentials: true,
      }),
    );
  }

  /**
   * Left off behind a serverless host, where the platform's CDN already compresses
   * responses on the way out. Running it here as well would mean this app declaring
   * `Content-Encoding: gzip` on a body that is then handed to the runtime to encode
   * again — double-encoded, and unreadable to the browser.
   */
  if (!env.isServerless) {
    app.use(compression());
  }

  app.use(morgan(env.isDevelopment ? 'dev' : 'combined'));

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());
  app.use(mongoSanitize);

  app.use('/api', apiRateLimiter, routes);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
