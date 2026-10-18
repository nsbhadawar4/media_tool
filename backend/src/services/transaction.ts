import mongoose, { type ClientSession } from 'mongoose';
import { logger } from '../utils/logger';

/**
 * Runs `work` in a MongoDB transaction, so a failure part-way leaves nothing half-written (Atlas
 * clusters are replica sets, which support them). A standalone server can't run transactions: there
 * the work runs without one — the first write fails before anything is written in that case, so
 * running again is safe — and a warning says so.
 *
 * `work` may be retried by the driver on a transient error, so it must not keep state between tries.
 */
export async function inTransaction<T>(work: (session: ClientSession | null) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let out: T | undefined;
    await session.withTransaction(async () => {
      out = await work(session);
    });
    return out as T;
  } catch (err) {
    const code = (err as { code?: number; codeName?: string }).code;
    const noTransactions = code === 20 || /Transaction numbers are only allowed|replica set/i.test(err instanceof Error ? err.message : '');
    if (!noTransactions) throw err;
    logger.warn('transactions are not supported by this MongoDB server; saving without one');
    return work(null);
  } finally {
    await session.endSession();
  }
}
