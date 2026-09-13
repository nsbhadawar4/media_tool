import type { NextFunction, Request, Response } from 'express';

/** Recursively strips keys that could be used for MongoDB operator injection (`$gt`, `a.b`, etc.). */
function stripDangerousKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripDangerousKeys(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (key.startsWith('$') || key.includes('.')) continue;
      result[key] = stripDangerousKeys(val);
    }
    return result as T;
  }
  return value;
}

/** Applied globally before routing; guards req.body, req.query and req.params. */
export function mongoSanitize(req: Request, _res: Response, next: NextFunction): void {
  if (req.body) req.body = stripDangerousKeys(req.body);
  if (req.params) req.params = stripDangerousKeys(req.params);
  if (req.query && Object.keys(req.query).length > 0) {
    const cleaned = stripDangerousKeys(req.query);
    Object.keys(req.query).forEach((k) => delete (req.query as Record<string, unknown>)[k]);
    Object.assign(req.query, cleaned);
  }
  next();
}
