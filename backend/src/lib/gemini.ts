import { ApiError, GoogleGenAI, type GenerateContentParameters } from '@google/genai';

/** Fast, free-tier-friendly model; the alias tracks Google's current Flash release. */
export const GEMINI_MODEL = 'gemini-flash-latest';

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

export class GeminiClient implements LlmClient {
  private readonly ai: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly budget: RequestBudget,
    private readonly model = GEMINI_MODEL,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generate(params: Omit<GenerateContentParameters, 'model'>): Promise<string> {
    if (!this.budget.take()) throw new LlmError('The assistant is busy right now. Please try again in a minute.', true);
    try {
      const res = await this.ai.models.generateContent({ ...params, model: this.model });
      const text = res.text;
      if (!text) {
        // Empty text usually means the response was blocked by a safety filter.
        throw new LlmError('This request could not be answered. Please rephrase, or ask your doctor or pharmacist.', false);
      }
      return text;
    } catch (e) {
      if (e instanceof LlmError) throw e;
      if (e instanceof ApiError) {
        if (e.status === 429) throw new LlmError('The assistant has reached its free usage limit for now. Please try again later.', true);
        if (e.status === 400 || e.status === 401 || e.status === 403) throw new LlmError('The AI service is not set up correctly on the server.', false);
        if (e.status >= 500) throw new LlmError('The AI service is busy. Please try again in a minute.', true);
      }
      throw new LlmError('Something went wrong reaching the AI service. Please try again.', true);
    }
  }
}
