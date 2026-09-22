/** Operational error with an HTTP status code. Thrown anywhere; caught by the global error handler. */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;
  /**
   * Stable, machine-readable cause, where one exists (see utils/uploadErrors).
   *
   * Separate from the message because the two have different audiences and different
   * lifetimes: the message is prose for whoever hit it and is rewritten freely, while
   * this is what a log filter, a test, or client code can hold onto.
   */
  public readonly code?: string;

  constructor(message: string, statusCode = 500, details?: unknown, code?: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, details?: unknown, code?: string) {
    return new AppError(message, 400, details, code);
  }
  static unauthorized(message = 'Not authenticated') {
    return new AppError(message, 401);
  }
  static forbidden(message = 'Not allowed') {
    return new AppError(message, 403);
  }
  static notFound(message = 'Not found') {
    return new AppError(message, 404);
  }
  static conflict(message: string) {
    return new AppError(message, 409);
  }
  static tooLarge(message: string, code?: string) {
    return new AppError(message, 413, undefined, code);
  }
  static tooMany(message = 'Too many requests') {
    return new AppError(message, 429);
  }
  static internal(message = 'Internal server error', code?: string) {
    return new AppError(message, 500, undefined, code);
  }
  /**
   * The deployment cannot serve this request as configured — a dependency is missing or
   * misconfigured rather than the request being wrong. Separate from `internal` because
   * the message is meant to be read: a 500 is deliberately opaque in production, which is
   * right for an unexpected fault and useless for one whose cause is a variable nobody
   * set.
   */
  static unavailable(message: string, code?: string) {
    return new AppError(message, 503, undefined, code);
  }
}
