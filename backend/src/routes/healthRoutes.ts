import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';

const router = Router();

const READY_STATE_LABEL: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

/**
 * Unauthenticated on purpose — a load balancer or uptime check has no session. It
 * therefore reports only whether the database link is up, never the host, the database
 * name or anything else that would describe the deployment to an anonymous caller.
 */
router.get('/', (_req: Request, res: Response) => {
  const state = mongoose.connection.readyState;
  const database = READY_STATE_LABEL[state] ?? 'unknown';
  res.status(state === 1 ? 200 : 503).json({ success: state === 1, database });
});

export default router;
