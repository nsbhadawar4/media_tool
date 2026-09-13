import type { IAdmin } from '../models/Admin';

declare global {
  namespace Express {
    interface Request {
      admin?: {
        id: string;
        email: string;
        name: string;
      };
    }
  }
}

export type { IAdmin };
