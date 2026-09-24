import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { LlmClient } from '../src/lib/gemini.js';
import { checkSources } from '../src/modules/assistant/assistant.service.js';
import { DrugInfoService } from '../src/modules/druginfo/druginfo.service.js';
import { ingredientsFromName } from '../src/modules/druginfo/ingredients.js';
import { pickLabel, toChunks, toRecord, type LabelRecord, type LabelSource } from '../src/modules/druginfo/openfda.js';
import { createTestDb, makeApi, signUp } from './helpers.js';

const METFORMIN: LabelRecord = {
  title: 'Metformin',
  setId: 'set-1',
  effectiveDate: '20260909',
  sections: {
    uses: ['Metformin is used with diet and exercise to improve blood sugar control in adults with type 2 diabetes.'],
    sideEffects: ['The most common side effects are diarrhea, nausea and upset stomach.'],
    avoid: ['Avoid drinking a lot of alcohol while taking metformin, because it raises the risk of lactic acidosis.'],
  },
};

class StubSource implements LabelSource {
  calls: string[] = [];
  fail = false;
  async fetchLabel(ingredient: string) {
    this.calls.push(ingredient);
    if (this.fail) throw new Error('down');
    return ingredient === 'metformin' ? METFORMIN : null;
  }
}

describe('ingredient names', () => {
  it.each([
    ['Tab. Metformin SR 500mg', ['metformin']],
    ['Paracetamol 650', ['acetaminophen']],
    ['Dolo 650', ['acetaminophen']],
    ['Amlodipine + Atenolol', ['amlodipine', 'atenolol']],
    ['Vitamin D3 60000 IU', ['cholecalciferol']],
  ])('%s → %j', (name, want) => expect(ingredientsFromName(name)).toEqual(want));

  it('never turns a combination brand into one of its parts', () => {
    expect(ingredientsFromName('Pan D')).toEqual(['pan d']);
    expect(ingredientsFromName('Telma H 40')).toEqual(['telma h']);
  });
});

describe('label parsing', () => {
  it('keeps only single-ingredient labels, preferring prescription and newest', () => {
    const r = (subs: string[], type: string, eff: string) => ({ set_id: eff, effective_time: eff, openfda: { substance_name: subs, product_type: [type] } });
    const picked = pickLabel('metformin', [
      r(['SITAGLIPTIN', 'METFORMIN HYDROCHLORIDE'], 'HUMAN PRESCRIPTION DRUG', '20260901'),
      r(['METFORMIN HYDROCHLORIDE'], 'HUMAN PRESCRIPTION DRUG', '20250101'),
      r(['METFORMIN HYDROCHLORIDE'], 'HUMAN PRESCRIPTION DRUG', '20260101'),
      r(['METFORMINX'], 'HUMAN PRESCRIPTION DRUG', '20270101'),
    ]);
    expect(picked?.set_id).toBe('20260101');
    expect(pickLabel('metformin', [r(['SITAGLIPTIN', 'METFORMIN HYDROCHLORIDE'], 'HUMAN PRESCRIPTION DRUG', '1')])).toBeNull();
  });

  it('turns label text into short plain passages without headings or section numbers', () => {
    const chunks = toChunks(['1 INDICATIONS AND USAGE Metformin tablets are indicated to improve glycemic control [see Clinical Studies (14)]. 5.1 Lactic Acidosis There have been reports.']);
    expect(chunks.join(' ')).not.toMatch(/INDICATIONS AND USAGE|\[see|5\.1|\(14\)/);
    expect(chunks[0]).toMatch(/^Metformin tablets are indicated/);
  });

  it('never keeps dosing sections', () => {
    const rec = toRecord('metformin', { set_id: 's', effective_time: '20260101', indications_and_usage: ['Used for type 2 diabetes in adults.'], dosage_and_administration: ['Start with 500 mg twice daily.'] });
    expect(JSON.stringify(rec.sections)).not.toMatch(/500 mg/);
    expect(rec.sections.uses).toHaveLength(1);
  });
});

describe('DrugInfoService', () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    t = await createTestDb();
  });
  beforeEach(async () => {
    await t.db.drugLabel.deleteMany();
  });
  afterAll(() => t.close());

  it('caches labels and misses, and refreshes after they go stale', async () => {
    const src = new StubSource();
    const svc = new DrugInfoService(t.db, src);
    const now = Date.parse('2026-09-25T00:00:00Z');
    expect((await svc.label('metformin', now))?.source).toBe('US FDA label: Metformin (2026)');
    expect(await svc.label('unknownium', now)).toBeNull();
    await svc.label('metformin', now + 1000);
    await svc.label('unknownium', now + 1000);
    expect(src.calls).toEqual(['metformin', 'unknownium']);

    await svc.label('metformin', now + 31 * 864e5); // label stale after 30 days
    await svc.label('unknownium', now + 8 * 864e5); // miss retried after 7 days
    expect(src.calls).toEqual(['metformin', 'unknownium', 'metformin', 'unknownium']);
  });

  it('keeps serving a stale label when the source is down', async () => {
    const src = new StubSource();
    const svc = new DrugInfoService(t.db, src);
    const now = Date.parse('2026-09-25T00:00:00Z');
    await svc.label('metformin', now);
    src.fail = true;
    expect((await svc.label('metformin', now + 40 * 864e5))?.title).toBe('Metformin');
  });

  it('picks passages that match the question', async () => {
    const svc = new DrugInfoService(t.db, new StubSource());
    const alcohol = await svc.snippetsFor('Can I drink alcohol with metformin?', ['Metformin 500', 'Amlodipine']);
    expect(alcohol[0]).toMatchObject({ medicine: 'Metformin 500', topic: 'avoid' });
    const side = await svc.snippetsFor('Does it have side effects?', ['Metformin 500']);
    expect(side[0]!.topic).toBe('sideEffects');
  });
});

describe('verified sources in answers', () => {
  const snippets = [{ source: 'US FDA label: Metformin (2026)', medicine: 'Metformin', topic: 'uses' as const, text: 'x' }];

  it('keeps a verified section only when its source was supplied', () => {
    const out = checkSources(
      [
        { kind: 'verified', text: 'It helps control blood sugar [US FDA label: Metformin (2026)].', source: '[US FDA label: Metformin (2026)]' },
        { kind: 'verified', text: 'Made-up fact.', source: 'Some website' },
        { kind: 'verified', text: 'No source.' },
      ],
      snippets,
    );
    expect(out.map((s) => s.kind)).toEqual(['verified', 'general', 'general']);
    expect(out[0]).toEqual({ kind: 'verified', text: 'It helps control blood sugar.', source: 'US FDA label: Metformin (2026)' });
  });

  describe('through the API', () => {
    let t: Awaited<ReturnType<typeof createTestDb>>;
    const calls: Parameters<LlmClient['generate']>[0][] = [];
    const llm: LlmClient = {
      async generate(p) {
        calls.push(p);
        return JSON.stringify({
          sections: [
            { kind: 'verified', text: 'Metformin helps control blood sugar.', source: 'US FDA label: Metformin (2026)' },
            { kind: 'verified', text: 'It cures everything.', source: 'Invented source' },
          ],
          followUps: [],
        });
      },
    };
    beforeAll(async () => {
      t = await createTestDb();
    });
    afterAll(() => t.close());

    it('puts label passages in the prompt and downgrades uncited "verified" claims', async () => {
      const api = makeApi(t.db, {}, null, llm, new StubSource());
      const { auth } = await signUp(api);
      await api.post('/api/v1/medications').set(auth).send({
        name: 'Metformin', dosage: '500 mg', doseQuantity: 1, unit: 'tablet', foodTiming: 'AFTER_FOOD',
        startDate: '2026-09-01', schedule: { frequency: 'DAILY', times: ['08:00'] },
      });
      const res = await api.post('/api/v1/assistant/chat').set(auth).send({ message: 'What is metformin used for?' });
      expect(res.status).toBe(200);
      const system = String(calls[0]!.config!.systemInstruction);
      expect(system).toContain('[US FDA label: Metformin (2026)]');
      expect(system).toContain('improve blood sugar control');
      expect(res.body.message.sections).toEqual([
        { kind: 'verified', text: 'Metformin helps control blood sugar.', source: 'US FDA label: Metformin (2026)' },
        { kind: 'general', text: 'It cures everything.' },
      ]);
    });
  });
});
