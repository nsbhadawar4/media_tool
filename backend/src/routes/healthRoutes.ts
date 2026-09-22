import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { isStorageConfigured } from '../services/storage';

const router = Router();

const READY_STATE_LABEL: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

/**
 * Unauthenticated on purpose — a load balancer or uptime check has no session. It
 * therefore reports only whether the database link is up and whether file storage is
 * configured, never the host, the database name, the storage provider or anything else
 * that would describe the deployment to an anonymous caller.
 *
 * Storage is reported because a deployment with no usable storage is not healthy in any
 * sense that matters here: every page loads, every list is empty, and the failure shows
 * up only when someone tries to upload — the one operation this app exists for. Checking
 * it is free (the provider is built from environment variables, with no network call), so
 * there is no reason for an operator to have to discover it the hard way.
 */
router.get('/', (_req: Request, res: Response) => {
  const state = mongoose.connection.readyState;
  const database = READY_STATE_LABEL[state] ?? 'unknown';
  const storageReady = isStorageConfigured();
  const healthy = state === 1 && storageReady;

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    database,
    storage: storageReady ? 'configured' : 'not-configured',
  });
});

export default router;
