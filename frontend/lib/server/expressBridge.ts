import { IncomingMessage, ServerResponse } from 'node:http';
import type { OutgoingHttpHeader, OutgoingHttpHeaders } from 'node:http';
import { Socket } from 'node:net';
import { PassThrough, Readable } from 'node:stream';
import type { Express } from 'express';

/**
 * Runs an Express application inside a Next.js Route Handler.
 *
 * Route Handlers speak the Web `Request`/`Response` types; Express speaks Node's
 * `IncomingMessage`/`ServerResponse`. This translates between the two so the existing
 * backend — its routers, middleware, auth and error handling — runs unchanged on a
 * serverless host, rather than being reimplemented a second time as route handlers.
 *
 * The response is streamed rather than buffered: headers are handed back as soon as the
 * app commits to them, and the body flows afterwards. That matters because a buffered
 * response on this platform is capped at a few megabytes, while a streamed one is not.
 */

/**
 * Stand-in peer address for the synthetic socket.
 *
 * There is no TCP connection here, so `socket.remoteAddress` would otherwise be
 * undefined — and `req.ip`, which Express derives from it, undefined with it. That is
 * not a cosmetic gap: express-rate-limit treats an undefined IP as unusable and leaves
 * the request hanging rather than rejecting it, so every call would stall until the
 * platform timed it out.
 *
 * A fixed loopback address is used rather than anything from the request, and that
 * choice is deliberate. The real client address arrives in X-Forwarded-For, which is
 * client-controlled and therefore only trustworthy to the extent that TRUST_PROXY says
 * a real proxy sits in front. Copying it here would hand Express a "connection address"
 * it trusts unconditionally, letting any caller forge a new rate-limit identity per
 * request. Instead this reads as the proxy itself: with TRUST_PROXY set (as it is on
 * Vercel) Express takes the client address from the forwarded header as intended, and
 * without it every caller shares one bucket — stricter than intended, never looser.
 */
const SYNTHETIC_PEER_ADDRESS = '127.0.0.1';

/** Node normalises header names to lower case; Web `Headers` already iterates that way. */
function toNodeHeaders(request: Request): {
  headers: Record<string, string>;
  rawHeaders: string[];
} {
  const headers: Record<string, string> = {};
  const rawHeaders: string[] = [];

  request.headers.forEach((value, name) => {
    // `Headers` has already folded any repeated header into one comma-joined value,
    // which is the same shape Node would have produced for everything except Set-Cookie
    // (a request header only a server sends, so it cannot occur here).
    headers[name] = value;
    rawHeaders.push(name, value);
  });

  return { headers, rawHeaders };
}

function buildNodeRequest(request: Request, socket: Socket): IncomingMessage {
  const req = new IncomingMessage(socket);
  const url = new URL(request.url);
  const { headers, rawHeaders } = toNodeHeaders(request);

  /**
   * Body-parsing middleware decides whether a request *has* a body by looking for a
   * Content-Length or Transfer-Encoding header, not by inspecting the stream. A Web
   * `Request` does not necessarily carry either — Content-Length is normally computed
   * when the request is sent, which already happened before this one reached us — and
   * without one, `express.json()` skips parsing entirely and hands the route an empty
   * body. Every write request would then fail validation, over a body that was present
   * the whole time. Declaring a chunked body is also simply accurate: what follows is a
   * stream of unknown length.
   */
  if (
    request.body &&
    headers['content-length'] === undefined &&
    headers['transfer-encoding'] === undefined
  ) {
    headers['transfer-encoding'] = 'chunked';
    rawHeaders.push('transfer-encoding', 'chunked');
  }

  req.method = request.method;
  // Express routes on the path and reads the query itself, so both must be present, and
  // it must be the path only — an absolute URL here would never match a mounted router.
  req.url = `${url.pathname}${url.search}`;
  req.headers = headers;
  req.rawHeaders = rawHeaders;
  req.httpVersion = '1.1';
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 1;

  /**
   * `complete` is the flag Node's HTTP parser sets when a message body has fully arrived,
   * and nothing sets it for a request assembled by hand. Left false it is read as a
   * truncated request: `IncomingMessage._destroy` checks it and, finding it unset, marks
   * the request aborted and emits `'aborted'` — on every request, at teardown, after the
   * body has long since been delivered intact.
   *
   * Almost nothing listens for that event, which is why this stayed invisible. Multer
   * does: it treats `'aborted'` as the client hanging up mid-upload, discards the file it
   * has just finished writing and fails the request. So every multipart upload through
   * this bridge returned a 500 over a body that arrived perfectly — the poster frame that
   * gives a video its thumbnail, and every upload at all on a deployment whose storage
   * cannot presign.
   */
  if (request.body) {
    const body = Readable.fromWeb(request.body as Parameters<typeof Readable.fromWeb>[0]);
    body.on('data', (chunk: Buffer) => req.push(chunk));
    body.on('end', () => {
      req.complete = true;
      req.push(null);
    });
    body.on('error', (err: Error) => req.destroy(err));
  } else {
    // Body-parsing middleware waits for EOF even on a GET, so it has to arrive.
    req.complete = true;
    req.push(null);
  }

  return req;
}

/** Copies Node's outgoing headers onto a Web `Headers`, preserving repeated values. */
function toWebHeaders(nodeHeaders: OutgoingHttpHeaders): Headers {
  const headers = new Headers();

  for (const [name, value] of Object.entries(nodeHeaders)) {
    if (value === undefined) continue;

    // Set-Cookie is the case that matters: logging in sends one cookie and logging out
    // clears it, and collapsing an array into a single comma-joined value would corrupt
    // any cookie whose own attributes contain a comma (Expires always does).
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, String(item));
    } else {
      headers.append(name, String(value));
    }
  }

  return headers;
}

type WriteHeadHeaders = OutgoingHttpHeaders | OutgoingHttpHeader[];
type WriteCallback = (error: Error | null | undefined) => void;

/**
 * A `ServerResponse` that writes into a stream instead of a socket.
 *
 * Subclassing the real class rather than faking one matters: Express's response object
 * inherits from `ServerResponse.prototype`, so everything it adds — `res.json`,
 * `res.cookie`, `res.redirect` — ultimately calls the methods overridden below, and
 * everything it does *not* override (header bookkeeping, `getHeaders`) keeps working
 * exactly as Node implements it.
 */
class BridgeResponse extends ServerResponse<IncomingMessage> {
  /** Carries the response body out to the Web `Response`. */
  readonly body = new PassThrough();

  private committed = false;
  private readonly commit: () => void;

  /** Resolves once the app has settled on a status and headers. */
  readonly headersReady: Promise<void>;

  constructor(req: IncomingMessage) {
    super(req);

    let resolveReady!: () => void;
    this.headersReady = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    this.commit = resolveReady;

    /**
     * Node backs `headersSent` with internal state that only a real socket write sets,
     * so it would stay false here forever. Express reads it to decide whether it may
     * still send a response — most visibly when an error surfaces after the body has
     * begun — and a false reading there would have it write a second response into a
     * stream that is already closed. Defined on the instance because the base class
     * declares it as a property, which a subclass accessor cannot override.
     */
    Object.defineProperty(this, 'headersSent', {
      get: () => this.committed,
      configurable: true,
    });

    /**
     * Express's own initialisation middleware runs `Object.setPrototypeOf(res, ...)` on
     * every response, to graft on `res.json`, `res.cookie` and the rest. That swaps this
     * object's prototype out entirely, so anything defined on the class below would be
     * silently discarded before the first route ever runs — leaving Node's original
     * `end()` in place, writing to a socket that does not exist, and the request hanging
     * until the platform gives up on it.
     *
     * Re-installing the overrides as own properties puts them ahead of whatever
     * prototype is in place, so they survive the swap.
     */
    for (const name of ['flushHeaders', 'writeHead', 'write', 'end'] as const) {
      const method = this[name] as unknown as (...args: unknown[]) => unknown;
      Object.defineProperty(this, name, {
        value: method.bind(this),
        writable: true,
        configurable: true,
      });
    }

    /**
     * `readable.pipe(res)` stops writing as soon as `write()` returns false and waits
     * for the *response* to say it is ready again. The backpressure is really the
     * PassThrough's, so without forwarding its drain the pipe stalls the moment a file
     * exceeds one buffer — which every real photo or video does — and the request hangs
     * with a partial body. Small responses would sail through untouched, so this only
     * ever shows up on the files that matter most.
     */
    this.body.on('drain', () => this.emit('drain'));

    /**
     * `res.destroy()` — which the media streaming handlers call when a source stream
     * fails — never reaches `end()`, so without this the body would stay open and the
     * request would hang until the platform timed it out.
     */
    this.on('close', () => {
      this.flushHeaders();
      if (!this.body.writableEnded) this.body.end();
    });
  }

  override flushHeaders(): void {
    if (this.committed) return;
    this.committed = true;
    this.commit();
  }

  override writeHead(
    statusCode: number,
    statusMessageOrHeaders?: string | WriteHeadHeaders,
    maybeHeaders?: WriteHeadHeaders,
  ): this {
    this.statusCode = statusCode;

    const headers =
      typeof statusMessageOrHeaders === 'string' ? maybeHeaders : statusMessageOrHeaders;
    if (typeof statusMessageOrHeaders === 'string') {
      this.statusMessage = statusMessageOrHeaders;
    }

    if (headers && !Array.isArray(headers)) {
      for (const [name, value] of Object.entries(headers)) {
        if (value !== undefined) this.setHeader(name, value);
      }
    }

    this.flushHeaders();
    return this;
  }

  override write(
    chunk: unknown,
    encodingOrCallback?: BufferEncoding | WriteCallback,
    callback?: WriteCallback,
  ): boolean {
    this.flushHeaders();

    const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined;
    const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    const payload = chunk as Buffer | string;

    return encoding ? this.body.write(payload, encoding, done) : this.body.write(payload, done);
  }

  override end(
    chunkOrCallback?: unknown,
    encodingOrCallback?: BufferEncoding | (() => void),
    callback?: () => void,
  ): this {
    this.flushHeaders();

    const chunk = typeof chunkOrCallback === 'function' ? undefined : chunkOrCallback;
    const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : undefined;
    const done =
      typeof chunkOrCallback === 'function'
        ? (chunkOrCallback as () => void)
        : typeof encodingOrCallback === 'function'
          ? encodingOrCallback
          : callback;

    if (chunk === undefined || chunk === null) {
      this.body.end(done);
    } else {
      const payload = chunk as Buffer | string;
      if (encoding) {
        this.body.end(payload, encoding, done);
      } else {
        this.body.end(payload, done);
      }
    }

    return this;
  }
}

/** Statuses that must not carry a body, per RFC 9110. */
function isBodyless(status: number): boolean {
  return status === 204 || status === 304 || (status >= 100 && status < 200);
}

/**
 * Hands one incoming request to an Express app and returns the app's response.
 *
 * Errors are deliberately not caught here: the Express app installs its own error
 * handler, which is what shapes every failure into the JSON envelope the frontend
 * expects and decides what may be said about it.
 */
export async function handleWithExpress(app: Express, request: Request): Promise<Response> {
  // Never connected, so it costs no file descriptor. It exists because IncomingMessage
  // requires one, and because `req.socket` is where Express looks for the remote address.
  const socket = new Socket();

  // `remoteAddress` and `remoteFamily` are getters backed by a handle this socket does
  // not have, so they have to be defined rather than assigned.
  Object.defineProperty(socket, 'remoteAddress', {
    value: SYNTHETIC_PEER_ADDRESS,
    configurable: true,
  });
  Object.defineProperty(socket, 'remoteFamily', { value: 'IPv4', configurable: true });

  const req = buildNodeRequest(request, socket);
  const res = new BridgeResponse(req);

  app(req, res);

  await res.headersReady;

  const status = res.statusCode;
  const headers = toWebHeaders(res.getHeaders());

  if (isBodyless(status) || request.method === 'HEAD') {
    // A body on these is a protocol error, and `Response` throws rather than ignoring it.
    res.body.resume();
    return new Response(null, { status, headers });
  }

  return new Response(Readable.toWeb(res.body) as ReadableStream<Uint8Array>, { status, headers });
}
