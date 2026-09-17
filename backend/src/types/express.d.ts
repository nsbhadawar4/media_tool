import type { UserRole } from '../models/User';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth. Ownership checks read this and never a client-supplied id. */
      user?: {
        id: string;
        email: string;
        name: string;
        role: UserRole;
      };
    }
  }
}

export {};
