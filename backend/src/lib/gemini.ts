import { ApiError, GoogleGenAI, type GenerateContentParameters } from '@google/genai';

/**
 * Tried in order. Free-tier Flash models are often briefly overloaded (503), so we fall through
 * to the next one instead of failing. Older IDs (e.g. gemini-2.5-flash) are closed to new keys.
 */
export const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'];

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
const TRY_NEXT = new Set([404, 500, 503]);

export class GeminiClient implements LlmClient {
  private readonly call: GenerateFn;

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
    for (const model of this.models) {
      try {
        const res = await this.call({ ...params, model });
        if (!res.text) {
          // Empty text usually means a safety filter blocked the response.
          throw new LlmError('This request could not be answered. Please rephrase, or ask your doctor or pharmacist.', false);
        }
        return res.text;
      } catch (e) {
        if (e instanceof LlmError) throw e;
        last = e;
        if (e instanceof ApiError && TRY_NEXT.has(e.status)) continue;
        break;
      }
    }
    throw toLlmError(last);
  }
}

function toLlmError(e: unknown): LlmError {
  if (e instanceof ApiError) {
    if (e.status === 429) return new LlmError('The assistant has reached its free usage limit for now. Please try again later.', true);
    if (e.status === 400 || e.status === 401 || e.status === 403) return new LlmError('The AI service is not set up correctly on the server.', false);
    if (e.status >= 500 || e.status === 404) return new LlmError('The AI service is busy. Please try again in a minute.', true);
  }
  return new LlmError('Something went wrong reaching the AI service. Please try again.', true);
}
