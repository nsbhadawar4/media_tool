/**
 * The admin page's side of resumable course generation: it asks the server for one step at a time,
 * waits exactly as the server says on a rate limit (counting down), stops when the server gives up
 * (the job is paused with its chapters kept) and resumes from the job as saved — never asking for a
 * chapter that is already written.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../lib/api/client';
import type { GenerationJob } from '../lib/api/courses';
import { nextChapterIndex, rateLimitOf, runGenerationJob, type RetryWait } from '../lib/api/courseGeneration';

/** A server stand-in with the real rules: one step per call, chapters kept, 429s with waits (2, 5, 10, 20, 40 s), giving up after 5. */
const DELAYS = [2000, 5000, 10000, 20000, 40000];
function fakeServer(total: number, busy: (chapter: number, call: number) => boolean) {
  const job: GenerationJob = {
    id: 'job1',
    classLevel: 7,
    subject: 'hindi',
    status: 'running',
    engine: 'ai',
    mode: 'new',
    brief: {} as GenerationJob['brief'],
    outline: null,
    chapters: [],
    by: { kind: 'ai', provider: 'gemini', model: 'gemini-test' },
    total,
    done: 0,
    next: 'outline',
    retry: null,
    lastError: null,
    updatedAt: '',
  };
  const asked: number[] = [];
  let attempts = 0;
  let calls = 0;
  const snapshot = (): GenerationJob => ({ ...job, chapters: [...job.chapters] });
  const next = async (): Promise<GenerationJob> => {
    calls++;
    if (!job.outline) {
      job.outline = { title: 'Hindi', description: '', objectives: [], chapters: Array.from({ length: total }, (_, i) => ({ title: `Chapter ${i + 1}`, description: '', lessonTitles: ['a'] })) };
      job.next = 'chapter:0';
      return snapshot();
    }
    const i = job.done;
    asked.push(i + 1);
    if (busy(i + 1, calls)) {
      attempts++;
      if (attempts > DELAYS.length) {
        job.status = 'paused';
        throw new ApiError('Gemini is still rate limiting requests after 5 automatic retries. Your completed chapters are saved — retry from the failed chapter (chapter 6) when you are ready.', 429, { gaveUp: true, chapter: i + 1, attempt: 5, of: 5, retryAfterMs: null, job: snapshot() }, 'AI_RATE_LIMITED');
      }
      const wait = DELAYS[attempts - 1]!;
      throw new ApiError('Gemini is temporarily rate limiting requests. Your completed chapters are saved. We will automatically retry shortly.', 429, { gaveUp: false, chapter: i + 1, attempt: attempts, of: 5, retryAfterMs: wait, retryAfterSeconds: wait / 1000, job: snapshot() }, 'AI_RATE_LIMITED');
    }
    attempts = 0;
    job.chapters.push({ title: `Chapter ${i + 1}` } as GenerationJob['chapters'][number]);
    job.done = job.chapters.length;
    job.status = job.done === total ? 'ready' : 'running';
    job.next = job.done === total ? null : `chapter:${job.done}`;
    return snapshot();
  };
  return { job, asked, next, resumeAs: () => ((job.status = 'running'), snapshot()) };
}
const clock = () => {
  const slept: number[] = [];
  return { slept, sleep: async (ms: number) => void slept.push(ms), total: () => slept.reduce((a, b) => a + b, 0) };
};

test('reads a 429 from the server: wait, retry n of 4, or given up', () => {
  const waiting = rateLimitOf(new ApiError('busy', 429, { gaveUp: false, chapter: 6, attempt: 2, of: 5, retryAfterMs: 5_400, retryAfterSeconds: 6 }, 'AI_RATE_LIMITED'));
  assert.deepEqual([waiting?.gaveUp, waiting?.chapter, waiting?.attempt, waiting?.of, waiting?.retryAfterMs], [false, 6, 2, 5, 5_400]);
  const old = rateLimitOf(new ApiError('busy', 429, { retryAfterSeconds: 27 }));
  assert.equal(old?.retryAfterMs, 27_000, 'seconds are enough when ms are not given');
  assert.equal(rateLimitOf(new ApiError('busy', 429, { gaveUp: true, retryAfterMs: null }))?.gaveUp, true);
  assert.equal(rateLimitOf(new ApiError('bad JSON', 502, undefined, 'AI_MALFORMED')), null, 'other failures are not rate limits');
  assert.equal(nextChapterIndex({ next: 'chapter:5' } as GenerationJob), 5);
  assert.equal(nextChapterIndex({ next: 'outline' } as GenerationJob), null);
});

test('normal run: the plan, then 12 chapters, one request at a time, in order', async () => {
  const s = fakeServer(12, () => false);
  let inFlight = 0;
  const run = await runGenerationJob({
    job: s.job,
    next: async () => {
      inFlight++;
      assert.equal(inFlight, 1, 'never two requests at once');
      const out = await s.next();
      inFlight--;
      return out;
    },
  });
  assert.equal(run.error, null);
  assert.equal(run.job.status, 'ready');
  assert.deepEqual(s.asked, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('a rate limit is waited out as the server says (2 s, then 5 s), counting down, then the chapter is retried and the run goes on', async () => {
  const s = fakeServer(12, (chapter, call) => chapter === 6 && call <= 8); // calls 7 and 8: chapter 6 busy twice
  const c = clock();
  const waits: Array<RetryWait | null> = [];
  const run = await runGenerationJob({ job: s.job, next: s.next, sleep: c.sleep, onWait: (w) => waits.push(w) });
  assert.equal(run.error, null);
  assert.equal(run.job.done, 12);
  assert.equal(c.total(), 7_000, '2 s + 5 s');
  assert.ok(c.slept.every((ms) => ms <= 1000), 'counts down a second at a time');
  assert.deepEqual(waits.find(Boolean), { chapter: 6, attempt: 1, of: 5, secondsLeft: 2 }, 'chapter 6: retrying in 2 s, attempt 1 of 5');
  assert.ok(waits.some((w) => w?.attempt === 2 && w.secondsLeft === 5));
  assert.equal(s.asked.filter((n) => n === 6).length, 3, 'chapter 6: one try and two retries');
  assert.equal(waits.at(-1), null);
});

test('still rate-limited after 5 retries: it stops with the server message; chapters 1–5 are kept; resuming later asks for 6–12 only — no duplicates', async () => {
  let gemini = 'busy';
  const s = fakeServer(12, (chapter) => chapter === 6 && gemini === 'busy');
  const c = clock();
  const first = await runGenerationJob({ job: s.job, next: s.next, sleep: c.sleep });
  assert.ok(first.error instanceof ApiError);
  assert.equal((first.error as ApiError).message, 'Gemini is still rate limiting requests after 5 automatic retries. Your completed chapters are saved — retry from the failed chapter (chapter 6) when you are ready.');
  assert.equal(rateLimitOf(first.error)?.gaveUp, true);
  assert.deepEqual([first.job.status, first.job.done, nextChapterIndex(first.job)], ['paused', 5, 5], 'paused at chapter 6 with 1–5 saved');
  assert.equal(c.total(), 77_000, 'waited 2 + 5 + 10 + 20 + 40 s before giving up');

  // Later ("Resume Generation"): from the job as saved.
  gemini = 'ok';
  s.asked.length = 0;
  const resumed = await runGenerationJob({ job: s.resumeAs(), next: s.next, sleep: c.sleep });
  assert.equal(resumed.error, null);
  assert.deepEqual(s.asked, [6, 7, 8, 9, 10, 11, 12], 'chapters 1–5 are never asked for again');
  const titles = resumed.job.chapters.map((ch) => ch.title);
  assert.deepEqual(
    titles,
    Array.from({ length: 12 }, (_, i) => `Chapter ${i + 1}`),
  );
  assert.equal(new Set(titles).size, 12, 'no duplicates');
});

test('other failures stop at once — no waiting, no retry loop — and leave the job to resume', async () => {
  const c = clock();
  let calls = 0;
  const job = fakeServer(3, () => false).job;
  const run = await runGenerationJob({
    job,
    sleep: c.sleep,
    next: async () => {
      calls++;
      throw new ApiError('The AI reply was not valid JSON.', 502, undefined, 'AI_MALFORMED');
    },
  });
  assert.match((run.error as Error).message, /not valid JSON/);
  assert.equal(calls, 1);
  assert.equal(c.total(), 0);
});

test('a job that is already written needs no request (e.g. resumed after a reload, before saving)', async () => {
  const s = fakeServer(2, () => false);
  await runGenerationJob({ job: s.job, next: s.next });
  let calls = 0;
  const again = await runGenerationJob({
    job: { ...s.job, status: 'ready' },
    next: async () => {
      calls++;
      return s.job;
    },
  });
  assert.equal(calls, 0);
  assert.equal(again.error, null);
});
