import { ApiError } from './client';
import type { GenerationJob } from './courses';

/**
 * Drives a saved generation job from the admin page: asks the server for the next step (the
 * outline, or the next missing chapter) until the course is written. The server keeps every
 * chapter as it arrives and owns the retry policy — on a rate limit it answers with how long to
 * wait (exponential backoff, or the provider's Retry-After) and which retry this is; after the last
 * retry it pauses the job, to be resumed later from the same chapter. Nothing is ever rewritten.
 */

/** What the server says about a rate limit (429 AI_RATE_LIMITED). */
export interface RateLimit {
  /** True once every retry is used: the job is paused. */
  gaveUp: boolean;
  /** 1-based chapter, or null for the course plan. */
  chapter: number | null;
  attempt: number;
  of: number;
  retryAfterMs: number | null;
  job: GenerationJob | null;
}

export function rateLimitOf(err: unknown): RateLimit | null {
  if (!(err instanceof ApiError) || (err.status !== 429 && err.code !== 'AI_RATE_LIMITED')) return null;
  const d = (err.details ?? {}) as Partial<RateLimit> & { retryAfterSeconds?: number | null };
  const ms = typeof d.retryAfterMs === 'number' ? d.retryAfterMs : typeof d.retryAfterSeconds === 'number' ? d.retryAfterSeconds * 1000 : null;
  return { gaveUp: Boolean(d.gaveUp) || ms === null, chapter: d.chapter ?? null, attempt: d.attempt ?? 0, of: d.of ?? 0, retryAfterMs: ms, job: d.job ?? null };
}

/** Shown while waiting: "Chapter 6 is temporarily rate-limited. Retrying in 8 seconds… Retry 2 of 4". */
export interface RetryWait {
  chapter: number | null;
  attempt: number;
  of: number;
  /** 0: retrying now. */
  secondsLeft: number;
}

/** 0-based index of the step a job will do next ("chapter:5" → 5), null for the plan or when done. */
export function nextChapterIndex(job: GenerationJob): number | null {
  return job.next?.startsWith('chapter:') ? Number(job.next.slice(8)) : null;
}

export interface JobRun {
  job: GenerationJob;
  /** The failure that stopped it (it is paused on the server), or null when the course is written. */
  error: unknown;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `job` to the end, one step at a time (never two requests at once). Waits as the server says
 * on a rate limit, counting down each second; stops at any other failure, or when the server has
 * given up, returning the job as saved (its finished chapters intact).
 */
export async function runGenerationJob(opts: {
  job: GenerationJob;
  next: (id: string) => Promise<GenerationJob>;
  onProgress?: (job: GenerationJob) => void;
  onWait?: (wait: RetryWait | null) => void;
  sleep?: (ms: number) => Promise<void>;
}): Promise<JobRun> {
  const sleep = opts.sleep ?? realSleep;
  let job = opts.job;
  // A ceiling on steps, so a misbehaving server can never keep the page looping.
  let budget = (job.total + 1) * 8 + 8;
  while (job.status !== 'ready' && budget-- > 0) {
    try {
      job = await opts.next(job.id);
      opts.onWait?.(null);
      opts.onProgress?.(job);
    } catch (err) {
      const limit = rateLimitOf(err);
      if (limit?.job) {
        job = limit.job;
        opts.onProgress?.(job);
      }
      if (!limit || limit.gaveUp || limit.retryAfterMs === null) {
        opts.onWait?.(null);
        return { job, error: err };
      }
      let left = limit.retryAfterMs;
      while (left > 0) {
        opts.onWait?.({ chapter: limit.chapter, attempt: limit.attempt, of: limit.of, secondsLeft: Math.ceil(left / 1000) });
        const step = Math.min(1000, left);
        await sleep(step);
        left -= step;
      }
      opts.onWait?.({ chapter: limit.chapter, attempt: limit.attempt, of: limit.of, secondsLeft: 0 });
    }
  }
  return { job, error: job.status === 'ready' ? null : new Error('Generation did not finish. Resume it to continue.') };
}
