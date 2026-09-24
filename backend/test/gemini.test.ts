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

  it('gives each model a time limit and moves on after a timeout', async () => {
    const call = vi.fn<GenerateFn>().mockRejectedValueOnce(new Error('Request timed out')).mockResolvedValueOnce({ text: 'ok' });
    await expect(client(call).generate({ contents: 'hi', config: { temperature: 0 } })).resolves.toBe('ok');
    expect(call.mock.calls.map((c) => c[0].model)).toEqual(['m1', 'm2']);
    const cfg = call.mock.calls[0]![0].config!;
    expect(cfg.temperature).toBe(0);
    expect(cfg.httpOptions?.timeout).toBeGreaterThan(0);
    expect(cfg.httpOptions?.timeout).toBeLessThanOrEqual(30_000);
  });

  it('gives the fast model a second try after a pause', async () => {
    const call = vi.fn<GenerateFn>().mockRejectedValueOnce(apiError(503)).mockRejectedValueOnce(apiError(503)).mockResolvedValueOnce({ text: 'ok' });
    const c = new GeminiClient('k', new RequestBudget(100, 1000), ['fast', 'other', 'fast', 'lite'], call);
    const t = Date.now();
    await expect(c.generate({ contents: 'hi' })).resolves.toBe('ok');
    expect(call.mock.calls.map((x) => x[0].model)).toEqual(['fast', 'other', 'fast']);
    expect(Date.now() - t).toBeGreaterThanOrEqual(1_400);
  });

  it('skips a model for a while after it reports its quota is used up', async () => {
    const call = vi.fn<GenerateFn>(async (p) => {
      if (p.model === 'm1') throw apiError(429);
      return { text: `from ${p.model}` };
    });
    const c = client(call);
    await expect(c.generate({ contents: 'a' })).resolves.toBe('from m2');
    await expect(c.generate({ contents: 'b' })).resolves.toBe('from m2');
    expect(call.mock.calls.map((x) => x[0].model)).toEqual(['m1', 'm2', 'm2']);
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
