import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { AppError } from '../utils/AppError';
import { sendError } from '../utils/apiResponse';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, 404, `Route not found: ${req.method} ${req.originalUrl}`);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.message, err.details);
    return;
  }

  if (err instanceof ZodError) {
    sendError(
      res,
      400,
      'Validation failed',
      err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
    return;
  }

  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'One or more files exceed the maximum allowed size'
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Too many files in a single upload'
          : err.message;
    sendError(res, 400, message);
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    sendError(
      res,
      400,
      'Validation failed',
      Object.values(err.errors).map((e) => e.message),
    );
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    sendError(res, 400, `Invalid identifier: ${err.value}`);
    return;
  }

  if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 11000) {
    sendError(res, 409, 'A record with these details already exists');
    return;
  }

  // busboy (multer's internal multipart parser) throws a plain Error — not a MulterError —
  // when the raw request body is malformed (e.g. control characters breaking a part header).
  // That's a bad request, not a server fault, regardless of NODE_ENV.
  if (err instanceof Error && /malformed part header|unexpected end of (form|multipart)/i.test(err.message)) {
    sendError(res, 400, 'Malformed upload request. Please try selecting the file(s) again.');
    return;
  }

  logger.error('Unhandled error', err);
  sendError(res, 500, env.isProduction ? 'Internal server error' : String((err as Error)?.stack ?? err));
}
