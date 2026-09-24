import { readdirSync } from 'node:fs';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, makeApi, signUp } from './helpers.js';

let t: Awaited<ReturnType<typeof createTestDb>>;
let api: ReturnType<typeof makeApi>;

beforeAll(async () => {
  t = await createTestDb();
  api = makeApi(t.db);
});
beforeEach(() => t.reset());
afterAll(() => t.close());

const metformin = {
  name: 'Metformin',
  dosage: '500 mg',
  doseQuantity: 1,
  unit: 'tablet',
  foodTiming: 'AFTER_FOOD',
  foodInstructions: 'After breakfast and dinner',
  instructions: 'Swallow with water',
  avoid: ['Avoid heavy alcohol'],
  startDate: '2026-09-01',
  schedule: { frequency: 'DAILY', times: ['08:00', '20:00'] },
};

const pngBytes = () =>
  sharp({ create: { width: 64, height: 64, channels: 3, background: '#3366aa' } }).png().toBuffer();

describe('medication CRUD', () => {
  it('creates, lists, reads, updates and soft-deletes', async () => {
    const { auth } = await signUp(api);

    const created = await api.post('/api/v1/medications').set(auth).send(metformin);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'Metformin',
      doseQuantity: 1,
      version: 1,
      endDate: null,
      imageUrl: null,
      avoid: [{ text: 'Avoid heavy alcohol', source: { kind: 'prescription' } }],
    });
    expect(created.body.schedules.map((s: { time: string }) => s.time)).toEqual(['08:00', '20:00']);

    const list = await api.get('/api/v1/medications').set(auth);
    expect(list.body).toHaveLength(1);

    const id = created.body.id;
    const patched = await api.patch(`/api/v1/medications/${id}`).set(auth).send({ version: 1, doseQuantity: 0.5, notes: 'Split tablet' });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ doseQuantity: 0.5, notes: 'Split tablet', version: 2, foodInstructions: 'After breakfast and dinner' });
    // Partial update must not wipe untouched fields.
    expect(patched.body.avoid).toHaveLength(1);

    expect((await api.delete(`/api/v1/medications/${id}`).set(auth)).status).toBe(204);
    expect((await api.get('/api/v1/medications').set(auth)).body).toHaveLength(0);
    expect((await api.get(`/api/v1/medications/${id}`).set(auth)).status).toBe(404);
    // Soft delete: the row (and its history) is kept.
    expect(await t.db.medication.count()).toBe(1);
  });

  it.each([
    [{ name: '' }, 'name'],
    [{ doseQuantity: 0.3 }, 'doseQuantity'],
    [{ unit: 'bucket' }, 'unit'],
    [{ endDate: '2026-08-01' }, 'endDate'],
    [{ schedule: { frequency: 'DAILY', times: [] } }, 'schedule.times'],
    [{ schedule: { frequency: 'DAILY', times: ['25:00'] } }, 'schedule.times.0'],
    [{ schedule: { frequency: 'DAILY', times: ['08:00', '08:00'] } }, 'schedule.times'],
    [{ schedule: { frequency: 'SPECIFIC_DAYS', times: ['08:00'] } }, 'schedule.daysOfWeek'],
    [{ schedule: { frequency: 'EVERY_N_DAYS', times: ['08:00'] } }, 'schedule.intervalDays'],
  ])('rejects invalid input %j', async (bad, field) => {
    const { auth } = await signUp(api);
    const res = await api.post('/api/v1/medications').set(auth).send({ ...metformin, ...bad });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.map((f: { path: string }) => f.path)).toContain(field);
  });

  it('cannot mark information as "verified" through the API', async () => {
    const { auth } = await signUp(api);
    const res = await api
      .post('/api/v1/medications')
      .set(auth)
      .send({ ...metformin, avoid: [{ text: 'x', source: { kind: 'verified', source: 'FDA' } }] });
    expect(res.status).toBe(422);
  });

  it('rejects stale edits with 409 (optimistic concurrency)', async () => {
    const { auth } = await signUp(api);
    const { body: med } = await api.post('/api/v1/medications').set(auth).send(metformin);
    await api.patch(`/api/v1/medications/${med.id}`).set(auth).send({ version: 1, notes: 'first' });
    const stale = await api.patch(`/api/v1/medications/${med.id}`).set(auth).send({ version: 1, notes: 'second' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });
});

describe('schedule changes keep dose history', () => {
  it('keeps unchanged times, archives removed ones, adds new ones', async () => {
    const { auth, user } = await signUp(api);
    const { body: med } = await api.post('/api/v1/medications').set(auth).send(metformin);
    const morning = med.schedules.find((s: { time: string }) => s.time === '08:00');
    const evening = med.schedules.find((s: { time: string }) => s.time === '20:00');

    // A taken dose recorded against the evening schedule.
    await t.db.medicationLog.create({
      data: {
        clientId: '00000000-0000-4000-8000-000000000001',
        medicationId: med.id,
        scheduleId: evening.id,
        patientId: user.id,
        scheduledFor: new Date('2026-09-10T14:30:00Z'),
        status: 'TAKEN',
        loggedById: user.id,
      },
    });

    const res = await api
      .patch(`/api/v1/medications/${med.id}`)
      .set(auth)
      .send({ version: 1, schedule: { frequency: 'DAILY', times: ['08:00', '14:00'] } });
    expect(res.status).toBe(200);
    const times = res.body.schedules.map((s: { time: string }) => s.time);
    expect(times).toEqual(['08:00', '14:00']);
    expect(res.body.schedules.find((s: { time: string }) => s.time === '08:00').id).toBe(morning.id);

    const archived = await t.db.medicationSchedule.findUniqueOrThrow({ where: { id: evening.id } });
    expect(archived.archivedAt).not.toBeNull();
    expect(await t.db.medicationLog.count()).toBe(1);
  });

  it('stores weekday schedules', async () => {
    const { auth } = await signUp(api);
    const res = await api
      .post('/api/v1/medications')
      .set(auth)
      .send({ ...metformin, schedule: { frequency: 'SPECIFIC_DAYS', times: ['09:00'], daysOfWeek: [5, 1, 3, 1] } });
    expect(res.body.schedules[0]).toMatchObject({ frequency: 'SPECIFIC_DAYS', daysOfWeek: [1, 3, 5], intervalDays: null });
  });
});

describe('authorization', () => {
  it("hides another patient's medicines (404, not 403)", async () => {
    const a = await signUp(api);
    const b = await signUp(api, { email: 'b@example.com' });
    const { body: med } = await api.post('/api/v1/medications').set(a.auth).send(metformin);

    expect((await api.get(`/api/v1/medications/${med.id}`).set(b.auth)).status).toBe(404);
    expect((await api.patch(`/api/v1/medications/${med.id}`).set(b.auth).send({ version: 1, notes: 'x' })).status).toBe(404);
    expect((await api.delete(`/api/v1/medications/${med.id}`).set(b.auth)).status).toBe(404);
    expect((await api.get(`/api/v1/medications?patientId=${a.user.id}`).set(b.auth)).status).toBe(404);
    expect((await api.post(`/api/v1/medications?patientId=${a.user.id}`).set(b.auth).send(metformin)).status).toBe(404);
    expect((await api.get('/api/v1/medications/not-a-uuid').set(a.auth)).status).toBe(404);
  });

  it('lets an active caregiver manage meds only with permission', async () => {
    const patient = await signUp(api);
    const carer = await signUp(api, { email: 'carer@example.com', role: 'CAREGIVER' });
    const rel = await t.db.caregiverRelationship.create({
      data: { caregiverId: carer.user.id, patientId: patient.user.id, status: 'ACTIVE', permissions: ['view_adherence'] },
    });
    const url = `/api/v1/medications?patientId=${patient.user.id}`;

    expect((await api.get(url).set(carer.auth)).status).toBe(200);
    expect((await api.post(url).set(carer.auth).send(metformin)).status).toBe(403);

    await t.db.caregiverRelationship.update({ where: { id: rel.id }, data: { permissions: ['view_adherence', 'manage_medications'] } });
    const created = await api.post(url).set(carer.auth).send(metformin);
    expect(created.status).toBe(201);
    expect(created.body.patientId).toBe(patient.user.id);

    // A caregiver without patientId gets nothing (they have no medicines of their own).
    expect((await api.get('/api/v1/medications').set(carer.auth)).status).toBe(404);
  });
});

describe('medicine photos', () => {
  it('uploads, re-encodes, serves via signed URL, and removes', async () => {
    const { auth } = await signUp(api);
    const { body: med } = await api.post('/api/v1/medications').set(auth).send(metformin);

    const up = await api.post(`/api/v1/medications/${med.id}/image`).set(auth).attach('image', await pngBytes(), 'pill.png');
    expect(up.status).toBe(200);
    expect(up.body.imageUrl).toMatch(/^\/api\/v1\/files\/[0-9a-f-]{36}\.jpg\?exp=\d+&sig=/);

    const file = await api.get(up.body.imageUrl);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/jpeg');
    expect((await sharp(file.body).metadata()).format).toBe('jpeg');

    // Tampered or unsigned links are refused.
    expect((await api.get(up.body.imageUrl.replace(/sig=.*$/, 'sig=' + 'A'.repeat(43)))).status).toBe(403);
    expect((await api.get(up.body.imageUrl.split('?')[0])).status).toBe(403);

    // Replacing deletes the old file; removing deletes the new one.
    const again = await api.post(`/api/v1/medications/${med.id}/image`).set(auth).attach('image', await pngBytes(), 'pill2.png');
    expect(readdirSync(api.storageDir)).toHaveLength(1);
    const removed = await api.delete(`/api/v1/medications/${med.id}/image`).set(auth);
    expect(removed.body.imageUrl).toBeNull();
    expect(readdirSync(api.storageDir)).toHaveLength(0);
    expect((await api.get(again.body.imageUrl)).status).toBe(404);
  });

  it('rejects files that are not images', async () => {
    const { auth } = await signUp(api);
    const { body: med } = await api.post('/api/v1/medications').set(auth).send(metformin);
    const res = await api.post(`/api/v1/medications/${med.id}/image`).set(auth).attach('image', Buffer.from('<script>alert(1)</script>'), 'x.png');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_IMAGE');
  });

  it("does not let another user change a patient's photo", async () => {
    const a = await signUp(api);
    const b = await signUp(api, { email: 'b@example.com' });
    const { body: med } = await api.post('/api/v1/medications').set(a.auth).send(metformin);
    const res = await api.post(`/api/v1/medications/${med.id}/image`).set(b.auth).attach('image', await pngBytes(), 'p.png');
    expect(res.status).toBe(404);
  });

  it('deleting the account removes photos from storage', async () => {
    const { auth } = await signUp(api);
    const { body: med } = await api.post('/api/v1/medications').set(auth).send(metformin);
    await api.post(`/api/v1/medications/${med.id}/image`).set(auth).attach('image', await pngBytes(), 'p.png');
    expect(readdirSync(api.storageDir)).toHaveLength(1);
    await api.delete('/api/v1/me').set(auth).send({ password: 'correct horse battery' });
    expect(readdirSync(api.storageDir)).toHaveLength(0);
  });
});
