import type { Request, Response } from 'express';

import { CourseGenerationJob, type ICourseGenerationJob } from '../models/CourseGenerationJob';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { AiProviderError, aiConfig, generateChapter, generateOutline, type CourseBrief, type CourseOutline, type Engine } from '../services/curriculum';
import { maxRateLimitRetries, providerLabel, rateLimitDelayMs } from '../services/curriculum/retryPolicy';
import { generationError } from './adminCourseController';
import { uid } from './adminClassController';

/**
 * Course generation as a saved job (see CourseGenerationJob): start it, then call "next" until it is
 * ready — each call does one short step (the outline, or the next missing chapter), so it fits a
 * serverless request. A rate limit is answered with how long to wait (exponential backoff, or the
 * provider's Retry-After) and the step is retried on the next call; after the last scheduled retry the
 * job pauses and resumes later from the same chapter. Template content is never used in place of AI.
 */

const OPEN = ['running', 'paused', 'ready'] as const;

const total = (job: ICourseGenerationJob) => ((job.outline as CourseOutline | null)?.chapters.length ?? (job.brief as unknown as CourseBrief).chapters) as number;
const stepOf = (job: ICourseGenerationJob) => (job.outline ? `chapter:${job.chapters.length}` : 'outline');
const label = (job: ICourseGenerationJob) => providerLabel(job.engine === 'ai' ? (job.by?.provider ?? aiConfig().provider) : null);

function view(job: ICourseGenerationJob) {
  const step = stepOf(job);
  return {
    id: String(job._id),
    classLevel: job.classLevel,
    subject: job.subjectKey,
    status: job.status,
    engine: job.engine,
    mode: job.mode,
    brief: job.brief,
    outline: job.outline,
    chapters: job.chapters,
    by: job.by,
    total: total(job),
    done: job.chapters.length,
    /** The step the next call will do: "outline", "chapter:5", or null when all is written. */
    next: job.status === 'ready' || job.status === 'complete' ? null : step,
    retry: job.retry ? { step: job.retry.step, attempt: job.retry.attempts, of: maxRateLimitRetries(), waitSeconds: Math.max(0, Math.ceil((job.retry.nextAt.getTime() - Date.now()) / 1000)) } : null,
    lastError: job.lastError,
    updatedAt: job.updatedAt,
  };
}

async function openJob(id: string) {
  const job = await CourseGenerationJob.findById(id);
  if (!job || !(OPEN as readonly string[]).includes(job.status)) throw AppError.notFound('This generation was finished or discarded. Start a new one.');
  return job;
}

/** 429 with what the page needs: wait this long, this is retry n of 4, or it gave up. */
function rateLimited(job: ICourseGenerationJob, step: string, attempt: number, waitMs: number | null): never {
  const chapter = step.startsWith('chapter:') ? Number(step.slice(8)) + 1 : null;
  const who = chapter ? `Chapter ${chapter}` : 'The course plan';
  const gaveUp = waitMs === null;
  const message = gaveUp
    ? `${label(job)} is still rate limiting requests after ${maxRateLimitRetries()} automatic retries. Your completed chapters are saved — retry from the failed chapter (${who.toLowerCase()}) when you are ready.`
    : `${label(job)} is temporarily rate limiting requests. Your completed chapters are saved. We will automatically retry shortly. (${who}: retry ${attempt} of ${maxRateLimitRetries()} in ${Math.ceil(waitMs / 1000)} s)`;
  throw new AppError(message, 429, { gaveUp, step, chapter, attempt, of: maxRateLimitRetries(), retryAfterSeconds: gaveUp ? null : Math.ceil(waitMs / 1000), retryAfterMs: gaveUp ? null : Math.round(waitMs), job: view(job) }, 'AI_RATE_LIMITED');
}

/** POST /api/admin/courses/generate/jobs — a new generation for this class and subject (any unfinished one is discarded). */
export const startGenerationJob = asyncHandler(async (req: Request, res: Response) => {
  const { brief, engine, mode } = req.body as { brief: CourseBrief; engine: Engine; mode: 'new' | 'new-version' };
  await CourseGenerationJob.updateMany({ classLevel: brief.classLevel, subjectKey: brief.subject.key, status: { $in: OPEN } }, { $set: { status: 'discarded' } });
  const job = await CourseGenerationJob.create({ classLevel: brief.classLevel, subjectKey: brief.subject.key, brief, engine, mode, createdBy: uid(req) });
  sendSuccess(res, view(job), 201, undefined, 'Generation started');
});

/** GET /api/admin/courses/generate/jobs/current?classLevel=&subject= — the unfinished generation to resume, if any. */
export const currentGenerationJob = asyncHandler(async (req: Request, res: Response) => {
  const { classLevel, subject } = req.query as unknown as { classLevel: number; subject: string };
  const job = await CourseGenerationJob.findOne({ classLevel, subjectKey: subject, status: { $in: OPEN } }).sort({ updatedAt: -1 });
  sendSuccess(res, job ? view(job) : null);
});

/** POST /api/admin/courses/generate/jobs/:id/next — one step: the outline, or the next chapter not written yet. */
export const nextGenerationStep = asyncHandler(async (req: Request, res: Response) => {
  const job = await openJob(req.params.id as string);
  if (job.status === 'ready') return sendSuccess(res, view(job));
  const step = stepOf(job);

  // Asked again before the wait is over: say how long is left, without troubling the provider.
  if (job.retry && job.retry.step === step && job.retry.nextAt.getTime() > Date.now()) rateLimited(job, step, job.retry.attempts, job.retry.nextAt.getTime() - Date.now());

  const brief = job.brief as unknown as CourseBrief;
  try {
    if (step === 'outline') {
      const r = await generateOutline(brief, job.engine);
      // Only if no other request planned it meanwhile.
      const saved = await CourseGenerationJob.findOneAndUpdate(
        { _id: job._id, outline: null, status: { $in: OPEN } },
        { $set: { outline: r.outline, by: r.by, retry: null, lastError: null, status: 'running' } },
        { new: true },
      );
      return sendSuccess(res, view(saved ?? (await openJob(String(job._id)))));
    }
    const index = job.chapters.length;
    const outline = job.outline as unknown as CourseOutline;
    // A chapter's lesson count follows its plan.
    const r = await generateChapter({ ...brief, lessonsPerChapter: outline.chapters[index]!.lessonTitles.length }, outline, index, job.engine);
    // Fill slot `index` only if it is still empty: a retry or a second tab can never add a chapter twice.
    const saved = await CourseGenerationJob.findOneAndUpdate(
      { _id: job._id, chapters: { $size: index }, status: { $in: OPEN } },
      { $push: { chapters: r.chapter }, $set: { by: r.by, retry: null, lastError: null, status: index + 1 >= outline.chapters.length ? 'ready' : 'running' } },
      { new: true },
    );
    return sendSuccess(res, view(saved ?? (await openJob(String(job._id)))));
  } catch (err) {
    if (err instanceof AiProviderError && err.code === 'rate_limited') {
      const attempt = (job.retry?.step === step ? job.retry.attempts : 0) + 1;
      if (attempt > maxRateLimitRetries()) {
        // Still limited after every retry: pause here, keeping what is written.
        job.status = 'paused';
        job.retry = null;
        job.lastError = { message: `${label(job)} is temporarily rate limiting requests.`, code: 'AI_RATE_LIMITED', rateLimited: true };
        await job.save();
        rateLimited(job, step, maxRateLimitRetries(), null);
      }
      const wait = rateLimitDelayMs(attempt, err.retryAfterMs);
      job.status = 'running';
      job.retry = { step, attempts: attempt, nextAt: new Date(Date.now() + wait) };
      await job.save();
      rateLimited(job, step, attempt, wait);
    }
    // Any other failure pauses the job too — what is written is kept; resuming tries this step again.
    job.status = 'paused';
    job.retry = null;
    job.lastError = { message: err instanceof Error ? err.message : 'Generation failed', code: err instanceof AiProviderError ? `AI_${err.code.toUpperCase()}` : null, rateLimited: false };
    await job.save();
    generationError(err);
  }
});

/** POST /api/admin/courses/generate/jobs/:id/finish — the course was saved from it: done. */
export const finishGenerationJob = asyncHandler(async (req: Request, res: Response) => {
  const job = await openJob(req.params.id as string);
  job.status = 'complete';
  job.retry = null;
  await job.save();
  sendSuccess(res, view(job));
});

/** DELETE /api/admin/courses/generate/jobs/:id — start over: the unfinished generation is set aside. */
export const discardGenerationJob = asyncHandler(async (req: Request, res: Response) => {
  const job = await openJob(req.params.id as string);
  job.status = 'discarded';
  job.retry = null;
  await job.save();
  sendSuccess(res, view(job));
});
