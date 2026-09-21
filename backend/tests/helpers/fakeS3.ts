/**
 * A minimal, in-process S3 object server for the storage tests.
 *
 * Cloudflare R2 is reached through the S3-compatible API, so `S3StorageProvider` is the
 * production code path for every uploaded file — and the one part of the app that cannot
 * otherwise be tested, because it needs a bucket. This stands in for one: enough of the
 * object API for the provider to drive, addressed path-style at /<bucket>/<key>, holding
 * everything in memory.
 *
 * Signatures are not verified. The AWS SDK's signing is not what these tests are about,
 * and there is no real secret to check against — what matters is that the provider
 * addresses the right object, sends the right bytes, and reads the response correctly.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface StoredObject {
  body: Buffer;
  contentType: string;
}

export interface FakeS3 {
  /** Endpoint to hand the S3 client, e.g. http://127.0.0.1:53124 */
  endpoint: string;
  /** Live contents of the bucket, keyed by object key. Assert against this directly. */
  objects: Map<string, StoredObject>;
  close(): Promise<void>;
}

/** Reads a whole request body into one buffer. */
function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Starts the server on an ephemeral port and resolves once it is accepting connections. */
export async function startFakeS3(bucket: string): Promise<FakeS3> {
  const objects = new Map<string, StoredObject>();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const decoded = decodeURIComponent(url.pathname);
    const prefix = `/${bucket}/`;

    if (!decoded.startsWith(prefix)) {
      res.writeHead(400).end();
      return;
    }

    const key = decoded.slice(prefix.length);
    const existing = objects.get(key);

    if (req.method === 'PUT') {
      /**
       * Refused rather than decoded, deliberately. `aws-chunked` with a trailing checksum
       * is an AWS extension that Cloudflare R2 does not accept, and silently unpacking it
       * here would let the very misconfiguration this project had to fix pass the tests.
       * A server that cannot decode it either rejects the request or stores the framing
       * as part of the file; failing outright is the version that says why.
       */
      if (req.headers['content-encoding'] === 'aws-chunked' || req.headers['x-amz-trailer']) {
        res
          .writeHead(501, { 'content-type': 'text/plain' })
          .end('This bucket does not implement aws-chunked uploads; use requestChecksumCalculation: WHEN_REQUIRED');
        return;
      }

      objects.set(key, {
        body: await readBody(req),
        contentType: req.headers['content-type'] ?? 'application/octet-stream',
      });
      res.writeHead(200, { ETag: '"fake-etag"' }).end();
      return;
    }

    if (req.method === 'DELETE') {
      // S3 reports success whether or not the key was there, which is what lets the
      // provider treat a repeated delete as a no-op.
      objects.delete(key);
      res.writeHead(204).end();
      return;
    }

    if (!existing) {
      res.writeHead(404).end();
      return;
    }

    // Overrides the caller signed into the URL, rather than what was stored. This is how
    // one set of bytes is served inline to a viewer and as a named download elsewhere.
    const contentType = url.searchParams.get('response-content-type') ?? existing.contentType;
    const disposition = url.searchParams.get('response-content-disposition');

    if (req.method === 'HEAD') {
      res
        .writeHead(200, {
          'content-length': String(existing.body.length),
          'content-type': contentType,
        })
        .end();
      return;
    }

    if (req.method === 'GET') {
      const range = /^bytes=(\d+)-(\d*)$/.exec(String(req.headers.range ?? ''));

      if (range) {
        const start = Number(range[1]);
        const end = range[2] ? Number(range[2]) : existing.body.length - 1;
        const slice = existing.body.subarray(start, end + 1);
        res
          .writeHead(206, {
            'content-type': contentType,
            'content-length': String(slice.length),
            'content-range': `bytes ${start}-${end}/${existing.body.length}`,
            ...(disposition ? { 'content-disposition': disposition } : {}),
          })
          .end(slice);
        return;
      }

      res
        .writeHead(200, {
          'content-type': contentType,
          'content-length': String(existing.body.length),
          ...(disposition ? { 'content-disposition': disposition } : {}),
        })
        .end(existing.body);
      return;
    }

    res.writeHead(405).end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    endpoint: `http://127.0.0.1:${port}`,
    objects,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
