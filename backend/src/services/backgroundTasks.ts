import { logger } from '../utils/logger';

/**
 * Work that must happen because of a request but must not hold up its response.
 *
 * The one user today is the password-reset email: sending it inside the request made a real
 * account answer noticeably slower than an unknown address, and an SMTP failure answered 503
 * only for real accounts — both of which told a caller whether an account existed. Sending it
 * after the response removes both signals without padding anything with artificial delays.
 *
 * How "after the response" is honoured depends on the host:
 *  - The standalone Express server (local dev, tests) is a long-lived process, so the task
 *    simply runs on; it is tracked so tests can wait for it (flushBackgroundTasks).
 *  - Inside the Next.js bridge on Vercel a function may be frozen as soon as it responds, so
 *    the bridge installs a runner backed by Next's `after()`, which keeps it alive until the
 *    task settles (setBackgroundRunner).
 */
type Task = () => Promise<void>;
type Runner = (task: Task) => void;

const pending = new Set<Promise<void>>();

/** Never lets a task's failure escape: it is logged, and the request it came from is long gone. */
function guarded(task: Task): Task {
  return () =>
    task().catch((err: unknown) => {
      logger.error('Background task failed', err);
    });
}

/** The default runner: start now, keep a handle so tests can await completion. */
export function runTracked(task: Task): void {
  const promise = guarded(task)().finally(() => pending.delete(promise));
  pending.add(promise);
}

let runner: Runner = runTracked;

export function setBackgroundRunner(next: Runner): void {
  runner = next;
}

export function runAfterResponse(task: Task): void {
  runner(guarded(task));
}

/** Resolves once every tracked task has finished. For tests. */
export async function flushBackgroundTasks(): Promise<void> {
  while (pending.size > 0) await Promise.all([...pending]);
}
