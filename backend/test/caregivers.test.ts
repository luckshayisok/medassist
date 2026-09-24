import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newInviteCode, normalizeCode } from '../src/modules/caregivers/caregivers.service.js';
import { createTestDb, makeApi, signUp } from './helpers.js';

describe('invite codes', () => {
  it('are 8 easy-to-read characters and accept sloppy typing', () => {
    const c = newInviteCode();
    expect(c).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
    expect(normalizeCode(' abcd-2345 ')).toBe('ABCD2345');
  });
});

describe('caregivers API', () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let api: ReturnType<typeof makeApi>;

  beforeAll(async () => {
    t = await createTestDb();
    api = makeApi(t.db);
  });
  beforeEach(() => t.reset());
  afterAll(() => t.close());

  const medicine = {
    name: 'Metformin', dosage: '500 mg', doseQuantity: 1, unit: 'tablet', foodTiming: 'AFTER_FOOD',
    startDate: '2026-01-01', schedule: { frequency: 'DAILY', times: ['00:00', '12:00'] },
  };

  async function linked(granted: string[] = ['receive_alerts']) {
    const patient = await signUp(api, { name: 'Asha Verma', email: 'asha@example.com' });
    const carer = await signUp(api, { name: 'Rohan Verma', email: 'rohan@example.com', role: 'CAREGIVER' });
    const inv = await api.post('/api/v1/caregivers/invite').set(patient.auth).send({ permissions: granted });
    expect(inv.status).toBe(201);
    const acc = await api.post('/api/v1/care/accept').set(carer.auth).send({ code: inv.body.code.toLowerCase() });
    expect(acc.status).toBe(201);
    return { patient, carer, code: inv.body.code as string };
  }

  it('links a caregiver with a code the patient shares, once', async () => {
    const { patient, carer, code } = await linked(['manage_medications']);
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const mine = await api.get('/api/v1/caregivers').set(patient.auth);
    expect(mine.body.caregivers).toHaveLength(1);
    expect(mine.body.caregivers[0]).toMatchObject({ name: 'Rohan Verma', email: 'rohan@example.com' });
    expect(mine.body.caregivers[0].permissions.sort()).toEqual(['manage_medications', 'verify_prescriptions', 'view_adherence']);
    expect(mine.body.invite).toBeNull();

    // A used code can't be used again, even by someone else.
    const other = await signUp(api, { email: 'other@example.com', role: 'CAREGIVER' });
    const again = await api.post('/api/v1/care/accept').set(other.auth).send({ code });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_CODE');

    // With manage permission the caregiver can add a medicine for the patient.
    const add = await api.post(`/api/v1/medications?patientId=${patient.user.id}`).set(carer.auth).send(medicine);
    expect(add.status).toBe(201);
  });

  it('only lets patients invite and caregivers accept', async () => {
    const patient = await signUp(api);
    const carer = await signUp(api, { email: 'c@example.com', role: 'CAREGIVER' });
    expect((await api.post('/api/v1/caregivers/invite').set(carer.auth).send({})).status).toBe(403);
    const inv = await api.post('/api/v1/caregivers/invite').set(patient.auth).send({});
    expect((await api.post('/api/v1/care/accept').set(patient.auth).send({ code: inv.body.code })).status).toBe(403);
  });

  it('rejects expired codes and replaces old unused ones', async () => {
    const patient = await signUp(api);
    const carer = await signUp(api, { email: 'c@example.com', role: 'CAREGIVER' });
    const first = await api.post('/api/v1/caregivers/invite').set(patient.auth).send({});
    const second = await api.post('/api/v1/caregivers/invite').set(patient.auth).send({});
    expect((await api.post('/api/v1/care/accept').set(carer.auth).send({ code: first.body.code })).status).toBe(400);
    await t.db.caregiverInvite.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await api.post('/api/v1/care/accept').set(carer.auth).send({ code: second.body.code })).status).toBe(400);
  });

  it('respects permissions: view only cannot change medicines', async () => {
    const { patient, carer } = await linked([]);
    const add = await api.post(`/api/v1/medications?patientId=${patient.user.id}`).set(carer.auth).send(medicine);
    expect(add.status).toBe(403);
    const list = await api.get(`/api/v1/medications?patientId=${patient.user.id}`).set(carer.auth);
    expect(list.status).toBe(200);
  });

  it('shows the caregiver how today is going for each person', async () => {
    const { patient, carer } = await linked();
    await api.post('/api/v1/medications').set(patient.auth).send(medicine);
    const people = await api.get('/api/v1/care/patients').set(carer.auth);
    expect(people.status).toBe(200);
    expect(people.body).toHaveLength(1);
    expect(people.body[0]).toMatchObject({ id: patient.user.id, name: 'Asha Verma' });
    expect(people.body[0].today).toHaveProperty('taken');

    const detail = await api.get(`/api/v1/care/patients/${patient.user.id}`).set(carer.auth);
    expect(detail.status).toBe(200);
    expect(detail.body.medications[0]).toMatchObject({ name: 'Metformin', times: ['00:00', '12:00'] });
    expect(detail.body.days.length).toBeGreaterThan(0);

    // Strangers get a 404, not a hint that the patient exists.
    const stranger = await signUp(api, { email: 's@example.com', role: 'CAREGIVER' });
    expect((await api.get(`/api/v1/care/patients/${patient.user.id}`).set(stranger.auth)).status).toBe(404);
  });

  it('alerts once per missed dose, only after linking, and only with permission', async () => {
    const { patient, carer } = await linked(['receive_alerts']);
    const med = await api.post('/api/v1/medications').set(patient.auth).send(medicine);
    // Pretend the medicine and the link have existed for a while.
    const past = new Date(Date.now() - 3 * 24 * 3600_000);
    await t.db.medication.update({ where: { id: med.body.id }, data: { createdAt: past } });
    await t.db.caregiverRelationship.updateMany({ data: { createdAt: past } });

    const first = await api.get('/api/v1/care/alerts').set(carer.auth);
    expect(first.status).toBe(200);
    // One of 00:00 / 12:00 is always 1–13 h ago; older misses (> 24 h) are not a backlog of alerts.
    expect(first.body.length).toBeGreaterThanOrEqual(1);
    expect(first.body.length).toBeLessThanOrEqual(2);
    expect(first.body[0]).toMatchObject({ patientName: 'Asha Verma', medication: 'Metformin', seen: false });

    const again = await api.get('/api/v1/care/alerts').set(carer.auth);
    expect(again.body).toHaveLength(first.body.length);

    await api.post('/api/v1/care/alerts/seen').set(carer.auth).send({ ids: [first.body[0].id] }).expect(204);
    expect((await api.get('/api/v1/care/alerts').set(carer.auth)).body.find((a: { id: string }) => a.id === first.body[0].id).seen).toBe(true);

    // Turning alerts off stops new ones; removing the caregiver removes access and alerts.
    const rel = (await api.get('/api/v1/caregivers').set(patient.auth)).body.caregivers[0];
    await api.patch(`/api/v1/caregivers/${rel.id}`).set(patient.auth).send({ permissions: [] }).expect(200);
    await api.delete(`/api/v1/caregivers/${rel.id}`).set(patient.auth).expect(204);
    expect((await api.get('/api/v1/care/alerts').set(carer.auth)).body).toHaveLength(0);
    expect((await api.get(`/api/v1/care/patients/${patient.user.id}`).set(carer.auth)).status).toBe(404);
    expect((await api.get('/api/v1/care/patients').set(carer.auth)).body).toHaveLength(0);
  });

  it('does not alert without the alerts permission', async () => {
    const { patient, carer } = await linked([]);
    const med = await api.post('/api/v1/medications').set(patient.auth).send(medicine);
    const past = new Date(Date.now() - 3 * 24 * 3600_000);
    await t.db.medication.update({ where: { id: med.body.id }, data: { createdAt: past } });
    await t.db.caregiverRelationship.updateMany({ data: { createdAt: past } });
    expect((await api.get('/api/v1/care/alerts').set(carer.auth)).body).toHaveLength(0);
  });

  it('lets a caregiver stop helping', async () => {
    const { patient, carer } = await linked();
    await api.delete(`/api/v1/care/patients/${patient.user.id}`).set(carer.auth).expect(204);
    expect((await api.get('/api/v1/caregivers').set(patient.auth)).body.caregivers).toHaveLength(0);
  });
});
