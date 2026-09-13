/** Operational error with an HTTP status code. Thrown anywhere; caught by the global error handler. */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(message, 400, details);
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
  static tooLarge(message: string) {
    return new AppError(message, 413);
  }
  static tooMany(message = 'Too many requests') {
    return new AppError(message, 429);
  }
  static internal(message = 'Internal server error') {
    return new AppError(message, 500);
  }
}
