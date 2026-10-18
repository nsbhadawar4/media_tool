import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import { logger } from '../../utils/logger';

/**
 * AI providers for the Course Generator, behind one small interface. Which one runs is set by
 * environment variables — keys are read here, on the server, and never sent to a browser:
 *
 *   AI_PROVIDER     anthropic | openai | gemini   (unset: no AI — the template generator is used, and labelled so)
 *   AI_API_KEY      the provider's key (or ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY)
 *   AI_MODEL        the model (default for anthropic: claude-opus-5-5; required for openai and gemini)
 *   AI_BASE_URL     optional: a different endpoint (a proxy, or a local stand-in in tests)
 *   AI_TIMEOUT_MS   optional: how long one request may take (default 180000)
 *
 * Anthropic is called through its official SDK with structured output (the response is parsed
 * against the same schema the server validates with). OpenAI and Gemini are called over their
 * documented REST APIs in JSON mode. Whatever a provider returns is validated again by the caller
 * (course.ts) before anything is used.
 */

export type ProviderName = 'anthropic' | 'openai' | 'gemini';
export type AiErrorCode = 'not_configured' | 'timeout' | 'refused' | 'truncated' | 'malformed' | 'auth' | 'rate_limited' | 'upstream';

/** A provider failure, with a message safe to show an administrator (no keys, no raw upstream bodies). */
export class AiProviderError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    /** rate_limited: how long the provider asked us to wait, when it said. */
    public readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export interface AiRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** A short name for the JSON being asked for ("course_outline"). */
  name: string;
  maxTokens: number;
}

export interface AiProvider {
  readonly name: ProviderName;
  readonly model: string;
  /** Returns the parsed JSON object (still to be validated by the caller). */
  json<T>(req: AiRequest<T>): Promise<unknown>;
}

const DEFAULT_MODEL: Partial<Record<ProviderName, string>> = { anthropic: 'claude-opus-5-5' };

export interface AiConfig {
  provider: ProviderName | null;
  model: string | null;
  /** Ready to call: provider, key and model all set. */
  ready: boolean;
  /** Why it isn't ready, in an administrator's words (no secrets). */
  problem: string | null;
}

export function aiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const raw = (env.AI_PROVIDER ?? '').trim().toLowerCase();
  if (!raw || raw === 'none' || raw === 'template') return { provider: null, model: null, ready: false, problem: 'No AI provider is configured (AI_PROVIDER is not set).' };
  if (raw !== 'anthropic' && raw !== 'openai' && raw !== 'gemini') return { provider: null, model: null, ready: false, problem: `AI_PROVIDER "${raw}" is not supported (use anthropic, openai or gemini).` };
  const provider = raw as ProviderName;
  const key = keyFor(provider, env);
  const model = (env.AI_MODEL ?? '').trim() || DEFAULT_MODEL[provider] || null;
  if (!key) return { provider, model, ready: false, problem: `AI_PROVIDER is ${provider} but no API key is set (AI_API_KEY).` };
  if (!model) return { provider, model, ready: false, problem: `AI_PROVIDER is ${provider} but AI_MODEL is not set.` };
  return { provider, model, ready: true, problem: null };
}

function keyFor(provider: ProviderName, env: NodeJS.ProcessEnv): string | null {
  const specific = { anthropic: env.ANTHROPIC_API_KEY, openai: env.OPENAI_API_KEY, gemini: env.GEMINI_API_KEY }[provider];
  return (env.AI_API_KEY ?? '').trim() || (specific ?? '').trim() || null;
}

const timeoutMs = (env: NodeJS.ProcessEnv) => {
  const n = Number(env.AI_TIMEOUT_MS);
  return Number.isFinite(n) && n >= 1000 ? n : 180_000;
};

/** AI_MIN_INTERVAL_MS: the least time between two requests to the provider (default 2 s; 0 turns pacing off). */
const intervalMs = (env: NodeJS.ProcessEnv) => {
  const n = Number(env.AI_MIN_INTERVAL_MS);
  return env.AI_MIN_INTERVAL_MS !== undefined && env.AI_MIN_INTERVAL_MS !== '' && Number.isFinite(n) && n >= 0 ? Math.min(n, 60_000) : 2000;
};

/** One queue per provider + model, shared by every request this server makes to it. */
const lanes = new Map<string, { tail: Promise<void>; lastAt: number }>();

/**
 * Requests to a provider go one at a time, at least `gap` ms apart — a course's chapters (or two
 * admins generating at once) never burst at the provider and trip its rate limit.
 */
function paced(inner: AiProvider, lane: string, gap: number): AiProvider {
  if (gap <= 0) return inner;
  return {
    name: inner.name,
    model: inner.model,
    json<T>(req: AiRequest<T>) {
      const q = lanes.get(lane) ?? { tail: Promise.resolve(), lastAt: 0 };
      lanes.set(lane, q);
      const run = q.tail.then(async () => {
        const wait = q.lastAt + gap - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        try {
          return await inner.json(req);
        } finally {
          q.lastAt = Date.now();
        }
      });
      q.tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}

/** The configured provider, or null when none is ready. */
export function createAiProvider(env: NodeJS.ProcessEnv = process.env): AiProvider | null {
  const cfg = aiConfig(env);
  if (!cfg.ready) return null;
  const key = keyFor(cfg.provider!, env)!;
  const base = (env.AI_BASE_URL ?? '').trim() || undefined;
  const timeout = timeoutMs(env);
  const provider =
    cfg.provider === 'anthropic'
      ? new AnthropicProvider(key, cfg.model!, timeout, base)
      : cfg.provider === 'openai'
        ? new OpenAiProvider(key, cfg.model!, timeout, base)
        : new GeminiProvider(key, cfg.model!, timeout, base);
  return paced(provider, `${cfg.provider}:${cfg.model}:${base ?? ''}`, intervalMs(env));
}

const RATE_LIMITED = 'The AI provider is busy (rate limit reached). It will be retried in a moment.';

/** "Retry-After: 30" (seconds) or Google's RetryInfo detail ("retryDelay": "27s"), in ms. */
function retryAfterOf(headers: Headers | undefined, body: unknown): number | null {
  const header = Number(headers?.get('retry-after'));
  if (Number.isFinite(header) && header > 0) return Math.round(header * 1000);
  const details = (body as { error?: { details?: Array<{ retryDelay?: unknown }> } } | null)?.error?.details;
  const delay = Array.isArray(details) ? details.find((d) => typeof d?.retryDelay === 'string')?.retryDelay : undefined;
  const secs = typeof delay === 'string' ? Number.parseFloat(delay) : NaN;
  return Number.isFinite(secs) && secs > 0 ? Math.round(secs * 1000) : null;
}

// ------------------------------------------------------------------------------------ Anthropic

class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic' as const;
  private readonly client: Anthropic;
  constructor(
    apiKey: string,
    readonly model: string,
    timeout: number,
    baseURL?: string,
  ) {
    this.client = new Anthropic({ apiKey, timeout, maxRetries: 1, ...(baseURL ? { baseURL } : {}) });
  }

  async json<T>(req: AiRequest<T>): Promise<unknown> {
    let response;
    try {
      // Structured output, read by hand: the stop reason is checked before the JSON (a refused or
      // cut-off reply has no complete JSON), and the caller validates the result against the schema.
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }],
        output_config: { format: zodOutputFormat(req.schema as z.ZodType) },
      });
    } catch (err) {
      throw anthropicError(err);
    }
    if (response.stop_reason === 'refusal') throw new AiProviderError('refused', 'The AI provider declined to write this content. Try rewording the request.');
    if (response.stop_reason === 'max_tokens') throw new AiProviderError('truncated', 'The AI reply was cut off before it was complete. Try fewer lessons or questions.');
    const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
    return parseJsonText(text);
  }
}

function anthropicError(err: unknown): AiProviderError {
  if (err instanceof AiProviderError) return err;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new AiProviderError('timeout', 'The AI provider took too long to answer. Please try again.');
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return new AiProviderError('auth', 'The AI provider rejected the configured API key.');
  if (err instanceof Anthropic.RateLimitError) return new AiProviderError('rate_limited', RATE_LIMITED, retryAfterOf(err.headers as Headers | undefined, null));
  if (err instanceof Anthropic.APIConnectionError) return new AiProviderError('upstream', 'The AI provider could not be reached.');
  if (err instanceof Anthropic.APIError) return new AiProviderError('upstream', `The AI provider returned an error (${err.status ?? 'unknown'}).`);
  // The SDK's parse step: the reply wasn't JSON matching the schema.
  return new AiProviderError('malformed', 'The AI reply was not valid course JSON.');
}

// ------------------------------------------------------------------------------------ REST providers

/** The JSON shape to produce, spelled out for providers called in plain JSON mode. */
const schemaHint = <T>(req: AiRequest<T>) => `Return a single JSON object matching this JSON Schema (${req.name}):\n${JSON.stringify(z.toJSONSchema(req.schema as z.ZodType))}`;

/** The provider's own error message ({ error: { message } } for Gemini and OpenAI), short and with any secret removed. */
function upstreamReason(body: { error?: { message?: unknown } } | null, secrets: string[]): string {
  let message = typeof body?.error?.message === 'string' ? body.error.message : '';
  for (const s of secrets) if (s) message = message.split(s).join('[redacted]');
  message = message.replace(/\s+/g, ' ').trim();
  return message.length > 200 ? `${message.slice(0, 200)}…` : message;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeout: number): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) throw new AiProviderError('timeout', 'The AI provider took too long to answer. Please try again.');
    throw new AiProviderError('upstream', 'The AI provider could not be reached.');
  }
  if (res.status === 401 || res.status === 403) throw new AiProviderError('auth', 'The AI provider rejected the configured API key.');
  if (!res.ok) {
    const failure = (await res.json().catch(() => null)) as { error?: { message?: unknown; status?: unknown } } | null;
    // 429, or Google's RESOURCE_EXHAUSTED (quota) whatever the status: a rate limit, worth retrying.
    if (res.status === 429 || failure?.error?.status === 'RESOURCE_EXHAUSTED') {
      const after = retryAfterOf(res.headers, failure);
      logger.warn(`course generator: AI provider rate limit (${res.status})${after ? `, retry after ${Math.round(after / 1000)} s` : ''}`);
      throw new AiProviderError('rate_limited', RATE_LIMITED, after);
    }
    const reason = upstreamReason(failure, Object.values(headers).map((v) => v.replace(/^Bearer\s+/i, '')));
    throw new AiProviderError('upstream', `The AI provider returned an error (${res.status})${reason ? `: ${reason}` : '.'}`);
  }
  return (await res.json().catch(() => {
    throw new AiProviderError('malformed', 'The AI provider returned an unreadable reply.');
  })) as Record<string, unknown>;
}

function parseJsonText(text: string | undefined): unknown {
  if (!text) throw new AiProviderError('malformed', 'The AI reply was empty.');
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    // Some replies wrap the object in a sentence or two: use the object itself when that parses.
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start && (start > 0 || end < trimmed.length - 1)) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // fall through to the report below
      }
    }
    const why = err instanceof Error ? err.message : String(err);
    const at = Number(/position (\d+)/.exec(why)?.[1] ?? -1);
    const around = at >= 0 ? trimmed.slice(Math.max(0, at - 80), at + 80) : trimmed.slice(-160);
    // Generated course text only (never request headers), so it is safe to log for diagnosis.
    logger.warn(`course generator: unparseable AI reply (${trimmed.length} chars): ${why} — near: ${JSON.stringify(around)}`);
    throw new AiProviderError('malformed', 'The AI reply was not valid JSON.');
  }
}

class OpenAiProvider implements AiProvider {
  readonly name = 'openai' as const;
  constructor(
    private readonly key: string,
    readonly model: string,
    private readonly timeout: number,
    private readonly base = 'https://api.openai.com',
  ) {}

  async json<T>(req: AiRequest<T>): Promise<unknown> {
    const data = await postJson(
      `${this.base.replace(/\/+$/, '')}/v1/chat/completions`,
      { authorization: `Bearer ${this.key}` },
      {
        model: this.model,
        max_completion_tokens: req.maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: `${req.prompt}\n\n${schemaHint(req)}` },
        ],
      },
      this.timeout,
    );
    const choice = (data.choices as Array<{ finish_reason?: string; message?: { content?: string; refusal?: string | null } }> | undefined)?.[0];
    if (choice?.message?.refusal) throw new AiProviderError('refused', 'The AI provider declined to write this content. Try rewording the request.');
    if (choice?.finish_reason === 'length') throw new AiProviderError('truncated', 'The AI reply was cut off before it was complete. Try fewer lessons or questions.');
    return parseJsonText(choice?.message?.content);
  }
}

class GeminiProvider implements AiProvider {
  readonly name = 'gemini' as const;
  constructor(
    private readonly key: string,
    readonly model: string,
    private readonly timeout: number,
    private readonly base = 'https://generativelanguage.googleapis.com',
  ) {}

  async json<T>(req: AiRequest<T>): Promise<unknown> {
    const data = await postJson(
      `${this.base.replace(/\/+$/, '')}/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      { 'x-goog-api-key': this.key },
      {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: `${req.prompt}

${schemaHint(req)}` }] }],
        // Thinking models count their reasoning against this limit: leave room for it and the answer.
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: Math.min(65536, req.maxTokens * 2) },
      },
      this.timeout,
    );
    const blocked = (data.promptFeedback as { blockReason?: string } | undefined)?.blockReason;
    if (blocked) throw new AiProviderError('refused', 'The AI provider declined this request. Try rewording the course description or instructions.');
    const candidate = (data.candidates as Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> | undefined)?.[0];
    if (!candidate) throw new AiProviderError('malformed', 'The AI provider returned an empty reply.');
    const reason = candidate.finishReason ?? 'STOP';
    if (['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'PUP_LIMITED_DISABLED', 'ESCALATION'].includes(reason)) {
      throw new AiProviderError('refused', `The AI provider stopped this content (${reason.toLowerCase()}). Try rewording the request.`);
    }
    if (reason === 'MAX_TOKENS' || reason === 'CONTINUATION') throw new AiProviderError('truncated', 'The AI reply was cut off before it was complete. Try fewer lessons or questions per chapter.');
    // Only the answer, never the model's thought parts.
    return parseJsonText(candidate.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join(''));
  }
}
