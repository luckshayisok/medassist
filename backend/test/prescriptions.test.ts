import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DemoExtractor, ExtractionError, type Extraction, type PrescriptionExtractor } from '../src/modules/prescriptions/extractor.js';
import { createTestDb, makeApi, signUp } from './helpers.js';

/** Controllable stand-in for the AI reader — no network, no cost. */
class StubExtractor implements PrescriptionExtractor {
  readonly name = 'stub';
  next: Extraction | Error = new Error('unset');
  calls = 0;
  async extract(): Promise<Extraction> {
    this.calls++;
    if (this.next instanceof Error) throw this.next;
    return this.next;
  }
}

let t: Awaited<ReturnType<typeof createTestDb>>;
let stub: StubExtractor;
let api: ReturnType<typeof makeApi>;

beforeAll(async () => {
  t = await createTestDb();
  stub = new StubExtractor();
  api = makeApi(t.db, {}, stub);
});
beforeEach(async () => {
  await t.reset();
  stub.next = await new DemoExtractor().extract();
  stub.calls = 0;
});
afterAll(() => t.close());

const photo = () => sharp({ create: { width: 600, height: 800, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();

async function scan(auth: Record<string, string>) {
  const up = await api.post('/api/v1/prescriptions').set(auth).attach('image', await photo(), 'rx.jpg');
  expect(up.status).toBe(202);
  // Processing runs in the background: poll like the app does.
  for (let i = 0; i < 50; i++) {
    const r = await api.get(`/api/v1/prescriptions/${up.body.id}`).set(auth);
    if (r.body.status !== 'UPLOADED' && r.body.status !== 'PROCESSING') return r.body;
    await new Promise((res) => setTimeout(res, 50));
  }
  throw new Error('processing did not finish');
}

const verifiedMed = (overrides: Record<string, unknown> = {}) => ({
  name: 'Metformin', dosage: '500 mg', doseQuantity: 1, unit: 'tablet', foodTiming: 'AFTER_FOOD', startDate: '2026-09-24',
  schedule: { frequency: 'DAILY', times: ['08:00', '21:00'] }, ...overrides,
});

describe('prescription scanning', () => {
  it('reads a prescription into drafts, flags unclear fields, and creates nothing yet', async () => {
    const { auth } = await signUp(api);
    const rx = await scan(auth);
    expect(rx.status).toBe('NEEDS_REVIEW');
    expect(rx.prescriber).toBe('Dr. A. Sharma');
    expect(rx.medications).toHaveLength(3);
    expect(rx.medications[0]).toMatchObject({ name: 'Metformin', strength: '500 mg', timesOfDay: ['morning', 'night'], foodTiming: 'AFTER_FOOD' });
    // The illegible name stays null — never guessed.
    expect(rx.medications[2]).toMatchObject({ name: null, unclearFields: ['name'] });
    expect(rx.warnings.length).toBeGreaterThan(0);
    expect(rx.imageUrl).toMatch(/^\/api\/v1\/files\//);
    // Nothing is activated until the patient confirms.
    expect(await t.db.medication.count()).toBe(0);
  });

  it('creates medicines only after explicit confirmation, linked to their drafts', async () => {
    const { auth } = await signUp(api);
    const rx = await scan(auth);
    const [metformin, atorva] = rx.medications;

    const unconfirmed = await api.patch(`/api/v1/prescriptions/${rx.id}/verify`).set(auth).send({ medications: [{ draftId: metformin.id, medication: verifiedMed() }] });
    expect(unconfirmed.status).toBe(422);

    const res = await api.patch(`/api/v1/prescriptions/${rx.id}/verify`).set(auth).send({
      confirmed: true,
      medications: [
        { draftId: metformin.id, medication: verifiedMed() },
        { draftId: atorva.id, medication: verifiedMed({ name: 'Atorvastatin', dosage: '20 mg', foodTiming: 'ANY', schedule: { frequency: 'DAILY', times: ['21:00'] } }) },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.medications).toHaveLength(2);
    expect(res.body.medications[0].prescriber).toBe('Dr. A. Sharma');
    expect(res.body.prescription.status).toBe('VERIFIED');
    expect((await t.db.prescriptionMedication.findUniqueOrThrow({ where: { id: metformin.id } })).verified).toBe(true);
    expect((await api.get('/api/v1/medications').set(auth)).body).toHaveLength(2);

    // Can't verify twice.
    const again = await api.patch(`/api/v1/prescriptions/${rx.id}/verify`).set(auth).send({ confirmed: true, medications: [{ draftId: null, medication: verifiedMed() }] });
    expect(again.status).toBe(409);
  });

  it('rejects drafts that belong to another prescription', async () => {
    const { auth } = await signUp(api);
    const a = await scan(auth);
    const b = await scan(auth);
    const res = await api.patch(`/api/v1/prescriptions/${a.id}/verify`).set(auth).send({ confirmed: true, medications: [{ draftId: b.medications[0].id, medication: verifiedMed() }] });
    expect(res.status).toBe(400);
  });

  it('fails politely on an unreadable photo and on reader errors, and can be retried', async () => {
    const { auth } = await signUp(api);
    stub.next = { readable: false, rawText: '', prescriber: null, date: null, medications: [], warnings: ['This does not look like a prescription.'] };
    const unreadable = await scan(auth);
    expect(unreadable).toMatchObject({ status: 'FAILED', canRetry: true });
    expect(unreadable.errorMessage).toMatch(/couldn't find any medicines/);

    stub.next = new ExtractionError('The reading service is busy. Please try again in a minute.', true);
    const busy = await scan(auth);
    expect(busy).toMatchObject({ status: 'FAILED', errorMessage: 'The reading service is busy. Please try again in a minute.' });

    stub.next = await new DemoExtractor().extract();
    const retry = await api.post(`/api/v1/prescriptions/${busy.id}/process`).set(auth);
    expect(retry.status).toBe(202);
    for (let i = 0; i < 50; i++) {
      const r = await api.get(`/api/v1/prescriptions/${busy.id}`).set(auth);
      if (r.body.status === 'NEEDS_REVIEW') return;
      await new Promise((res) => setTimeout(res, 50));
    }
    throw new Error('retry did not complete');
  });

  it('keeps scans private to the patient', async () => {
    const a = await signUp(api);
    const b = await signUp(api, { email: 'b@example.com' });
    const rx = await scan(a.auth);
    expect((await api.get(`/api/v1/prescriptions/${rx.id}`).set(b.auth)).status).toBe(404);
    expect((await api.patch(`/api/v1/prescriptions/${rx.id}/verify`).set(b.auth).send({ confirmed: true, medications: [{ draftId: null, medication: verifiedMed() }] })).status).toBe(404);
    expect((await api.delete(`/api/v1/prescriptions/${rx.id}`).set(b.auth)).status).toBe(404);
    expect((await api.get('/api/v1/prescriptions').set(b.auth)).body).toEqual([]);
  });

  it('deleting a scan removes its photo but keeps medicines already added', async () => {
    const { auth } = await signUp(api);
    const rx = await scan(auth);
    await api.patch(`/api/v1/prescriptions/${rx.id}/verify`).set(auth).send({ confirmed: true, medications: [{ draftId: rx.medications[0].id, medication: verifiedMed() }] });
    expect((await api.delete(`/api/v1/prescriptions/${rx.id}`).set(auth)).status).toBe(204);
    expect(await t.db.prescription.count()).toBe(0);
    expect((await api.get('/api/v1/medications').set(auth)).body).toHaveLength(1);
  });

  it('explains when scanning is not configured', async () => {
    const plain = makeApi(t.db); // no extractor
    const { auth } = await signUp(plain, { email: 'noai@example.com' });
    const up = await plain.post('/api/v1/prescriptions').set(auth).attach('image', await photo(), 'rx.jpg');
    let status = up.body.status;
    let body = up.body;
    for (let i = 0; i < 20 && (status === 'UPLOADED' || status === 'PROCESSING'); i++) {
      await new Promise((r) => setTimeout(r, 50));
      body = (await plain.get(`/api/v1/prescriptions/${up.body.id}`).set(auth)).body;
      status = body.status;
    }
    expect(body).toMatchObject({ status: 'FAILED' });
    expect(body.errorMessage).toMatch(/not set up/);
  });

  it('serves a friendly root URL', async () => {
    const res = await api.get('/');
    expect(res.body).toMatchObject({ service: 'MedAssist API', status: 'ok' });
  });
});
