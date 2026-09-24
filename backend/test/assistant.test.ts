import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LlmError, RequestBudget, type LlmClient } from '../src/lib/gemini.js';
import { containsUnsafeAdvice, isEmergency } from '../src/modules/assistant/safety.js';
import { parseExtraction } from '../src/modules/prescriptions/extractor.js';
import { createTestDb, makeApi, signUp } from './helpers.js';

/** Fake model: records what it was asked, returns what the test chooses. No network, no cost. */
class StubLlm implements LlmClient {
  reply: string | Error = '';
  calls: Parameters<LlmClient['generate']>[0][] = [];
  async generate(params: Parameters<LlmClient['generate']>[0]) {
    this.calls.push(params);
    if (this.reply instanceof Error) throw this.reply;
    return this.reply;
  }
}
const json = (sections: { kind: string; text: string; source?: string | null }[], followUps: string[] = []) =>
  JSON.stringify({ sections: sections.map((s) => ({ source: null, ...s })), followUps });

describe('emergency detection', () => {
  it.each([
    'I have chest pain after my tablet',
    "I can't breathe properly",
    'I took too many tablets by mistake',
    'my father fainted',
    'her lips are swelling up',
    'I want to kill myself',
    'saans nahi aa rahi',
  ])('flags "%s"', (m) => expect(isEmergency(m)).toBe(true));

  it.each(['What is metformin for?', 'Can I take it with milk?', 'I missed my morning dose'])('does not flag "%s"', (m) =>
    expect(isEmergency(m)).toBe(false),
  );
});

describe('unsafe advice filter', () => {
  it.each([
    'You can double your dose tomorrow to catch up.',
    'Take an extra tablet tonight.',
    "It's fine to stop taking it if you feel better.",
    'You probably have diabetes.',
    'Just increase your dose a little.',
  ])('blocks "%s"', (text) => expect(containsUnsafeAdvice([{ kind: 'general', text }])).toBe(true));

  it('allows quoting the patient’s own prescription and safe referrals', () => {
    expect(containsUnsafeAdvice([{ kind: 'prescription', text: 'Your prescription says to take 2 tablets after dinner.' }])).toBe(false);
    expect(containsUnsafeAdvice([{ kind: 'safety', text: 'Please ask your pharmacist before changing anything.' }])).toBe(false);
  });

  it.each([
    'Never take a double dose to make up for a missed one.',
    'Please do not stop taking it without talking to your doctor.',
    'You should not double your dose.',
    "Don't take an extra tablet if you miss one.",
  ])('allows the warning "%s"', (text) => expect(containsUnsafeAdvice([{ kind: 'safety', text }])).toBe(false));

  it('still blocks unsafe advice that follows a warning in another sentence', () => {
    expect(containsUnsafeAdvice([{ kind: 'general', text: 'Never panic. Take an extra dose tonight.' }])).toBe(true);
    expect(containsUnsafeAdvice([{ kind: 'general', text: "Don't take it anymore." }])).toBe(true);
  });
});

describe('free-tier request budget', () => {
  it('limits per minute and per day', () => {
    const b = new RequestBudget(2, 3);
    const t = Date.parse('2026-09-24T10:00:00Z');
    expect([b.take(t), b.take(t + 1), b.take(t + 2)]).toEqual([true, true, false]);
    expect(b.take(t + 61_000)).toBe(true); // new minute
    expect(b.take(t + 122_000)).toBe(false); // daily cap (3) reached
    expect(b.take(Date.parse('2026-09-25T00:00:01Z'))).toBe(true); // next day
  });
});

describe('prescription reader output parsing', () => {
  it('maps NOT_STATED food timing to null and rejects malformed output', () => {
    const ok = parseExtraction(JSON.stringify({
      readable: true, rawText: 'x', prescriber: null, date: null, warnings: [],
      medications: [{ name: 'A', strength: null, form: null, dose: null, frequency: null, timesOfDay: [], foodTiming: 'NOT_STATED', foodInstructions: null, duration: null, instructions: null, sourceText: 'A', confidence: 0.9, unclearFields: [] }],
    }));
    expect(ok.medications[0]!.foodTiming).toBeNull();
    expect(() => parseExtraction('not json')).toThrow();
    expect(() => parseExtraction(JSON.stringify({ readable: true }))).toThrow();
  });
});

describe('assistant API', () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let llm: StubLlm;
  let api: ReturnType<typeof makeApi>;

  beforeAll(async () => {
    t = await createTestDb();
    llm = new StubLlm();
    api = makeApi(t.db, {}, null, llm);
  });
  beforeEach(async () => {
    await t.reset();
    llm.calls = [];
    llm.reply = json([{ kind: 'general', text: 'Metformin is commonly used to help control blood sugar.' }, { kind: 'prescription', text: 'Your prescription says 500 mg after food at 8 AM and 9 PM.' }], ['What if I miss a dose?']);
  });
  afterAll(() => t.close());

  async function patientWithMetformin() {
    const u = await signUp(api);
    await api.post('/api/v1/medications').set(u.auth).send({
      name: 'Metformin', dosage: '500 mg', doseQuantity: 1, unit: 'tablet', foodTiming: 'AFTER_FOOD', instructions: 'Swallow with water',
      startDate: '2026-09-01', schedule: { frequency: 'DAILY', times: ['08:00', '21:00'] },
    });
    return u;
  }

  it('answers with labelled sections, grounded in the patient’s own medicines', async () => {
    const { auth } = await patientWithMetformin();
    const res = await api.post('/api/v1/assistant/chat').set(auth).send({ message: 'What is this medicine for?' });
    expect(res.status).toBe(200);
    expect(res.body.message.sections.map((s: { kind: string }) => s.kind)).toEqual(['general', 'prescription']);
    expect(res.body.message.followUps).toEqual(['What if I miss a dose?']);

    const system = String(llm.calls[0]!.config!.systemInstruction);
    expect(system).toContain('Metformin 500 mg: 1 tablet at 08:00, 21:00');
    expect(system).toContain('never');

    // The conversation continues with history.
    await api.post('/api/v1/assistant/chat').set(auth).send({ conversationId: res.body.conversationId, message: 'And the dose?' });
    expect(llm.calls[1]!.contents).toHaveLength(3);
    const hist = await api.get('/api/v1/assistant/history').set(auth);
    expect(hist.body.messages).toHaveLength(4);
  });

  it('handles emergencies without calling the model', async () => {
    const { auth } = await patientWithMetformin();
    const res = await api.post('/api/v1/assistant/chat').set(auth).send({ message: 'I took double my tablets and feel dizzy' });
    expect(res.body.message.sections[0]).toMatchObject({ kind: 'emergency' });
    expect(res.body.message.sections[0].text).toMatch(/call 112/);
    expect(llm.calls).toHaveLength(0);
  });

  it('replaces unsafe model output with a safe referral', async () => {
    const { auth } = await patientWithMetformin();
    llm.reply = json([{ kind: 'general', text: 'Since you missed it, you can double your dose tonight.' }]);
    const res = await api.post('/api/v1/assistant/chat').set(auth).send({ message: 'I missed my morning dose, what do I do?' });
    expect(res.body.message.sections).toEqual([{ kind: 'safety', text: expect.stringMatching(/doctor or pharmacist/) }]);
    expect(res.body.message.followUps).toEqual([]);
  });

  it('never shows malformed model output', async () => {
    const { auth } = await patientWithMetformin();
    llm.reply = 'Sure! {broken';
    const res = await api.post('/api/v1/assistant/chat').set(auth).send({ message: 'hello' });
    expect(res.body.message.sections[0].kind).toBe('safety');
  });

  it('reports busy / quota errors politely', async () => {
    const { auth } = await patientWithMetformin();
    llm.reply = new LlmError('The assistant has reached its free usage limit for now. Please try again later.', true);
    const res = await api.post('/api/v1/assistant/chat').set(auth).send({ message: 'What is this for?' });
    expect(res.status).toBe(503);
    expect(res.body.error.message).toMatch(/free usage limit/);
  });

  it('keeps chats private', async () => {
    const a = await patientWithMetformin();
    const b = await signUp(api, { email: 'b@example.com' });
    await api.post('/api/v1/assistant/chat').set(a.auth).send({ message: 'What is this for?' });
    expect((await api.get('/api/v1/assistant/history').set(b.auth)).body.messages).toEqual([]);
    expect((await api.get(`/api/v1/assistant/history?patientId=${a.user.id}`).set(b.auth)).status).toBe(404);
    expect((await api.post(`/api/v1/assistant/chat?patientId=${a.user.id}`).set(b.auth).send({ message: 'hi' })).status).toBe(404);
  });

  it('says so when no AI key is configured', async () => {
    const plain = makeApi(t.db);
    const { auth } = await signUp(plain, { email: 'plain@example.com' });
    const res = await plain.post('/api/v1/assistant/chat').set(auth).send({ message: 'What is this for?' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('ASSISTANT_UNAVAILABLE');
  });

  it('clears history', async () => {
    const { auth } = await patientWithMetformin();
    await api.post('/api/v1/assistant/chat').set(auth).send({ message: 'What is this for?' });
    expect((await api.delete('/api/v1/assistant/history').set(auth)).status).toBe(204);
    expect((await api.get('/api/v1/assistant/history').set(auth)).body.messages).toEqual([]);
  });
});

// Silence unused import warnings in environments that tree-check tests.
void vi;
