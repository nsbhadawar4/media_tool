import type { Response } from 'express';

/**
 * Every response carries `success`, and errors carry the human-readable text in both
 * `message` and `error.message`. The nested form is what the frontend client reads;
 * the top-level one is what a plain HTTP client would look for first. Keeping both
 * means neither has to change to satisfy the other.
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: Record<string, unknown>,
  message?: string,
) {
  return res.status(statusCode).json({
    success: true,
    ...(message ? { message } : {}),
    data,
    ...(meta ? { meta } : {}),
  });
}

export function sendError(
  res: Response,
  statusCode: number,
  message: string,
  details?: unknown,
  code?: string,
) {
  return res.status(statusCode).json({
    success: false,
    message,
    // `code` is optional and additive: a client that ignores it sees exactly the envelope
    // it saw before, and one that reads it gets a cause that outlives the wording.
    error: { message, ...(code ? { code } : {}), ...(details !== undefined ? { details } : {}) },
  });
}
