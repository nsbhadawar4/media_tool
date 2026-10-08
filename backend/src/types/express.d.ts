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
      /** The session token behind req.user, as verified by requireAuth. Never sent to clients. */
      authSession?: {
        /** Absent for tokens issued before session ids existed. */
        id?: string;
        expiresAt: Date;
        persistent: boolean;
      };
    }
  }
}

export {};
