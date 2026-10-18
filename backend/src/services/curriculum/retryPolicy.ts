/**
 * How long to wait before asking an AI provider again after it rate-limited a request: a backoff
 * schedule (2, 5, 10, 20, 40 s by default) plus a little random jitter so retries never line up, or
 * the provider's own Retry-After when that is longer (followed up to a minute). After the last
 * scheduled retry a step gives up — its generation is paused, to be retried from that chapter.
 *
 *   AI_RETRY_DELAYS_MS  the waits, comma-separated (default "2000,5000,10000,20000,40000");
 *                       their count is the number of automatic retries
 *   AI_RETRY_JITTER_MS  up to this much is added at random (default 1000)
 */
const DEFAULT_DELAYS_MS = [2000, 5000, 10000, 20000, 40000];
/** The provider's own Retry-After is followed up to this long. */
const MAX_PROVIDER_WAIT_MS = 60_000;

const setting = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** The backoff schedule in ms (its length is the number of automatic retries). */
export function retryDelays(env: NodeJS.ProcessEnv = process.env): number[] {
  const list = (env.AI_RETRY_DELAYS_MS ?? '')
    .split(',')
    .map((s) => s.trim())
    // Unset or blank entries are skipped (Number('') is 0, which would mean "retry at once").
    .filter((s) => s !== '')
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0);
  return list.length ? list.slice(0, 10) : DEFAULT_DELAYS_MS;
}

/** How many times a rate-limited step is retried automatically before it pauses. */
export const maxRateLimitRetries = (env: NodeJS.ProcessEnv = process.env) => retryDelays(env).length;

/** The wait before retry `attempt` (1-based) in ms. */
export function rateLimitDelayMs(attempt: number, providerRetryAfterMs: number | null, env: NodeJS.ProcessEnv = process.env, random: () => number = Math.random): number {
  const delays = retryDelays(env);
  const jitter = setting(env.AI_RETRY_JITTER_MS, 1000);
  const scheduled = delays[Math.min(Math.max(1, attempt), delays.length) - 1]!;
  const provider = providerRetryAfterMs && providerRetryAfterMs > 0 ? Math.min(providerRetryAfterMs, MAX_PROVIDER_WAIT_MS) : 0;
  return Math.max(scheduled, provider) + Math.floor(random() * jitter);
}

/** "Gemini", "OpenAI", "Claude" — for messages an administrator reads. */
export function providerLabel(provider: string | null | undefined): string {
  return ({ gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Claude' } as Record<string, string>)[provider ?? ''] ?? 'The AI provider';
}
