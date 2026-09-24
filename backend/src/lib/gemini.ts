import { ApiError, GoogleGenAI, type GenerateContentParameters } from '@google/genai';
import { logger } from './logger.js';

/**
 * Tried in order. Free-tier Flash models are often briefly overloaded (503), so we fall through
 * to the next one instead of failing. The fast model gets a second chance (after a short pause)
 * before the slower lite model. Older IDs (e.g. gemini-2.5-flash) are closed to new keys.
 */
export const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.6-flash', 'gemini-flash-lite-latest'];
const RETRY_PAUSE_MS = 1_500;
/** After a quota error, leave that model alone for this long. */
const COOLDOWN_MS = 60_000;

export class LlmError extends Error {
  constructor(
    message: string,
    /** Worth retrying later (quota, overload, network). */
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * Keeps usage inside a free-tier key's limits across the whole server: a per-minute window and a
 * daily cap. Over the limit, callers get a friendly "busy" instead of a quota error from Google.
 */
export class RequestBudget {
  private minute: number[] = [];
  private day = { key: '', count: 0 };

  constructor(
    private readonly perMinute: number,
    private readonly perDay: number,
  ) {}

  take(now = Date.now()): boolean {
    this.minute = this.minute.filter((t) => now - t < 60_000);
    const dayKey = new Date(now).toISOString().slice(0, 10);
    if (this.day.key !== dayKey) this.day = { key: dayKey, count: 0 };
    if (this.minute.length >= this.perMinute || this.day.count >= this.perDay) return false;
    this.minute.push(now);
    this.day.count++;
    return true;
  }
}

export interface LlmClient {
  generate(params: Omit<GenerateContentParameters, 'model'>): Promise<string>;
}

/** Minimal surface of the SDK we use — lets tests inject a fake. */
export interface GenerateFn {
  (params: GenerateContentParameters): Promise<{ text?: string }>;
}

// Model-side conditions where another model may succeed.
// 429 too: free-tier quotas are per model, so another model may still have room.
const TRY_NEXT = new Set([404, 429, 500, 503, 504]);
/** One model gets this long before we move on; the whole chain stops after TOTAL_MS. */
const ATTEMPT_MS = 30_000;
const TOTAL_MS = 75_000;

export class GeminiClient implements LlmClient {
  private readonly call: GenerateFn;
  private readonly coolingUntil = new Map<string, number>();

  constructor(
    apiKey: string,
    private readonly budget: RequestBudget,
    private readonly models: string[] = GEMINI_MODELS,
    call?: GenerateFn,
  ) {
    if (call) {
      this.call = call;
    } else {
      const ai = new GoogleGenAI({ apiKey });
      this.call = (p) => ai.models.generateContent(p);
    }
  }

  async generate(params: Omit<GenerateContentParameters, 'model'>): Promise<string> {
    if (!this.budget.take()) throw new LlmError('The assistant is busy right now. Please try again in a minute.', true);
    let last: unknown;
    const deadline = Date.now() + TOTAL_MS;
    for (const [i, model] of this.models.entries()) {
      const isLast = i === this.models.length - 1;
      // A model that just said "quota used up" is skipped for a while (unless it is the last hope).
      if (!isLast && (this.coolingUntil.get(model) ?? 0) > Date.now()) continue;
      if (this.models.indexOf(model) < i) await sleep(RETRY_PAUSE_MS); // second try of the same model
      const remaining = deadline - Date.now();
      if (remaining < 5_000) break;
      // The last model is the final chance, so it may use all the time left.
      const timeout = isLast ? remaining : Math.min(params.config?.httpOptions?.timeout ?? ATTEMPT_MS, remaining);
      try {
        const res = await this.call({ ...params, model, config: { ...params.config, httpOptions: { ...params.config?.httpOptions, timeout } } });
        if (!res.text) {
          // Empty text usually means a safety filter blocked the response.
          throw new LlmError('This request could not be answered. Please rephrase, or ask your doctor or pharmacist.', false);
        }
        return res.text;
      } catch (e) {
        if (e instanceof LlmError) throw e;
        last = e;
        // Never log prompts (they hold health data); status and a short reason are enough.
        logger.warn({ model, status: e instanceof ApiError ? e.status : undefined, reason: String((e as Error)?.message ?? e).slice(0, 160) }, 'Gemini attempt failed');
        if (e instanceof ApiError) {
          if (e.status === 429) this.coolingUntil.set(model, Date.now() + COOLDOWN_MS);
          if (TRY_NEXT.has(e.status)) continue;
          break;
        }
        // Timeouts and network hiccups: another model (or endpoint) may answer.
        continue;
      }
    }
    throw toLlmError(last);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toLlmError(e: unknown): LlmError {
  if (e instanceof ApiError) {
    if (e.status === 429) return new LlmError('The assistant has reached its free usage limit for now. Please try again later.', true);
    if (e.status === 400 || e.status === 401 || e.status === 403) return new LlmError('The AI service is not set up correctly on the server.', false);
    if (e.status >= 500 || e.status === 404) return new LlmError('The AI service is busy. Please try again in a minute.', true);
  }
  return new LlmError('Something went wrong reaching the AI service. Please try again.', true);
}
