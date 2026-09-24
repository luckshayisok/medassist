import { ApiError } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';
import { GeminiClient, LlmError, RequestBudget, type GenerateFn } from '../src/lib/gemini.js';

const apiError = (status: number) => new ApiError({ message: `status ${status}`, status });
const client = (call: GenerateFn, budget = new RequestBudget(100, 1000)) => new GeminiClient('k', budget, ['m1', 'm2', 'm3'], call);

describe('GeminiClient', () => {
  it('falls through to the next model when one is overloaded', async () => {
    const call = vi.fn<GenerateFn>().mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce({ text: 'ok' });
    await expect(client(call).generate({ contents: 'hi' })).resolves.toBe('ok');
    expect(call.mock.calls.map((c) => c[0].model)).toEqual(['m1', 'm2']);
  });

  it('does not retry other models on a bad request, and explains quota limits', async () => {
    const bad = vi.fn<GenerateFn>().mockRejectedValue(apiError(400));
    await expect(client(bad).generate({ contents: 'hi' })).rejects.toMatchObject({ retryable: false });
    expect(bad).toHaveBeenCalledTimes(1);

    const quota = vi.fn<GenerateFn>().mockRejectedValue(apiError(429));
    await expect(client(quota).generate({ contents: 'hi' })).rejects.toThrow(/free usage limit/);
  });

  it('reports busy when every model is overloaded', async () => {
    const call = vi.fn<GenerateFn>().mockRejectedValue(apiError(503));
    await expect(client(call).generate({ contents: 'hi' })).rejects.toMatchObject({ retryable: true });
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('treats an empty (filtered) response as unanswerable', async () => {
    const call = vi.fn<GenerateFn>().mockResolvedValue({ text: '' });
    await expect(client(call).generate({ contents: 'hi' })).rejects.toBeInstanceOf(LlmError);
  });

  it('refuses before calling Google once the free-tier budget is used up', async () => {
    const call = vi.fn<GenerateFn>().mockResolvedValue({ text: 'ok' });
    const c = client(call, new RequestBudget(1, 10));
    await c.generate({ contents: 'a' });
    await expect(c.generate({ contents: 'b' })).rejects.toThrow(/busy/);
    expect(call).toHaveBeenCalledTimes(1);
  });
});
