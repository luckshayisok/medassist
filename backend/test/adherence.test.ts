import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adherenceReport, buildInsights, expandDoses, tally, type LogIn, type MedicationIn } from '../src/modules/adherence/compute.js';
import { dateKeyInTz, tzOffsetMinutes, zonedToUtc } from '../src/lib/time.js';
import { createTestDb, makeApi, signUp } from './helpers.js';

describe('timezone helpers', () => {
  it('converts wall-clock times in a patient timezone', () => {
    expect(zonedToUtc('2026-09-24', '08:00', 'Asia/Kolkata').toISOString()).toBe('2026-09-24T02:30:00.000Z');
    expect(tzOffsetMinutes(new Date('2026-09-24T00:00:00Z'), 'Asia/Kolkata')).toBe(330);
    expect(dateKeyInTz(new Date('2026-09-24T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-09-25');
  });

  it('keeps 8 AM at 8 AM across US daylight-saving changes', () => {
    expect(zonedToUtc('2026-03-07', '08:00', 'America/New_York').toISOString()).toBe('2026-03-07T13:00:00.000Z'); // EST
    expect(zonedToUtc('2026-03-09', '08:00', 'America/New_York').toISOString()).toBe('2026-03-09T12:00:00.000Z'); // EDT
  });
});

const TZ = 'Asia/Kolkata';
const med = (id: string, times: string[], extra: Partial<MedicationIn> = {}): MedicationIn => ({
  id,
  name: id,
  dosage: '5 mg',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
  schedules: times.map((time, i) => ({ id: `${id}-${i}`, time, frequency: 'DAILY', daysOfWeek: [], intervalDays: null, startDate: '2026-01-01', endDate: null, archivedAt: null })),
  ...extra,
});
const at = (key: string, hhmm: string) => zonedToUtc(key, hhmm, TZ);
const taken = (sid: string, key: string, hhmm: string, minutesLate = 0): LogIn => ({
  scheduleId: sid, scheduledFor: at(key, hhmm), status: 'TAKEN', takenAt: new Date(at(key, hhmm).getTime() + minutesLate * 60_000), snoozedUntil: null, skipReason: null,
});

describe('expandDoses / tally', () => {
  it('classifies taken, late, skipped, missed and pending', () => {
    const meds = [med('A', ['08:00', '20:00'])];
    const logs: LogIn[] = [
      taken('A-0', '2026-09-23', '08:00', 5),
      taken('A-1', '2026-09-23', '20:00', 90), // late
      { scheduleId: 'A-0', scheduledFor: at('2026-09-24', '08:00'), status: 'SKIPPED', takenAt: null, snoozedUntil: null, skipReason: 'UNWELL' },
    ];
    const now = at('2026-09-24', '20:30'); // 24th 20:00 is due but within the hour → pending
    const doses = expandDoses(meds, logs, TZ, '2026-09-22', '2026-09-24', now);
    const t = tally(doses);
    expect(t).toMatchObject({ scheduled: 6, taken: 2, late: 1, skipped: 1, missed: 2, pending: 1 });
    expect(t.percent).toBe(40); // 2 / (2 + 1 + 2)
  });

  it('does not count doses before the medicine was added, or after it was removed', () => {
    const added = med('A', ['08:00'], { createdAt: at('2026-09-23', '12:00') });
    const removed = med('B', ['08:00'], { deletedAt: at('2026-09-23', '12:00') });
    const archived = med('C', ['08:00']);
    archived.schedules[0]!.archivedAt = at('2026-09-23', '12:00');
    const doses = expandDoses([added, removed, archived], [], TZ, '2026-09-22', '2026-09-24', at('2026-09-25', '12:00'));
    expect(doses.filter((d) => d.medicationId === 'A').map((d) => d.date)).toEqual(['2026-09-24']);
    expect(doses.filter((d) => d.medicationId === 'B').map((d) => d.date)).toEqual(['2026-09-22', '2026-09-23']);
    expect(doses.filter((d) => d.medicationId === 'C').map((d) => d.date)).toEqual(['2026-09-22', '2026-09-23']);
  });

  it('treats a snoozed dose as due again when the snooze ends', () => {
    const logs: LogIn[] = [{ scheduleId: 'A-0', scheduledFor: at('2026-09-24', '08:00'), status: 'SNOOZED', takenAt: null, snoozedUntil: at('2026-09-24', '09:30'), skipReason: null }];
    const pending = expandDoses([med('A', ['08:00'])], logs, TZ, '2026-09-24', '2026-09-24', at('2026-09-24', '10:00'));
    expect(pending[0]!.outcome).toBe('PENDING');
    const missed = expandDoses([med('A', ['08:00'])], logs, TZ, '2026-09-24', '2026-09-24', at('2026-09-24', '10:45'));
    expect(missed[0]!.outcome).toBe('MISSED');
  });
});

describe('insights', () => {
  const meds = [med('Metformin', ['08:00', '20:00']), med('Aspirin', ['13:00'])];
  const days = ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24'];

  it('spots a missed evening pattern and the most-missed medicine, in plain words', () => {
    const logs = days.flatMap((d, i) => [taken('Metformin-0', d, '08:00'), taken('Aspirin-0', d, '13:00'), ...(i % 2 === 0 ? [] : [taken('Metformin-1', d, '20:00')])]);
    const report = adherenceReport(meds, logs, TZ, days[0]!, days[6]!, at('2026-09-24', '23:00'), 'this week');
    const texts = report.insights.map((i) => i.text);
    expect(texts).toContain('You missed your evening medicine 4 times this week.');
    expect(texts).toContain('Metformin was the medicine missed most often (4 times).');
    expect(report.days).toHaveLength(7);
    expect(report.medications.find((m) => m.name === 'Aspirin')?.percent).toBe(100);
  });

  it('celebrates a perfect week and counts a streak', () => {
    const logs = days.flatMap((d) => [taken('Metformin-0', d, '08:00'), taken('Metformin-1', d, '20:00'), taken('Aspirin-0', d, '13:00')]);
    const texts = adherenceReport(meds, logs, TZ, days[0]!, days[6]!, at('2026-09-24', '23:00'), 'this week').insights.map((i) => i.text);
    expect(texts).toContain('You took every dose this week. Well done!');
    expect(texts.some((t) => /6-day streak/.test(t))).toBe(true);
  });

  it('never gives dosing or diagnostic advice', () => {
    const logs: LogIn[] = days.map((d) => ({ scheduleId: 'Aspirin-0', scheduledFor: at(d, '13:00'), status: 'SKIPPED', takenAt: null, snoozedUntil: null, skipReason: 'RAN_OUT' }));
    const doses = expandDoses(meds, logs, TZ, days[0]!, days[6]!, at('2026-09-24', '23:00'));
    const all = buildInsights(doses, meds, 'this week', '2026-09-24').map((i) => i.text).join(' ');
    expect(all).not.toMatch(/double|extra dose|take more|stop taking|diagnos|increase|decrease|should take/i);
    expect(all).toMatch(/pharmacy/);
  });
});

describe('dose log sync + adherence API', () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let api: ReturnType<typeof makeApi>;
  beforeAll(async () => {
    t = await createTestDb();
    api = makeApi(t.db);
  });
  beforeEach(() => t.reset());
  afterAll(() => t.close());

  async function setup() {
    const u = await signUp(api, { timezone: 'UTC' });
    const { body: m } = await api.post('/api/v1/medications').set(u.auth).send({
      name: 'Metformin', dosage: '500 mg', doseQuantity: 1, unit: 'tablet', foodTiming: 'AFTER_FOOD', startDate: '2020-01-01',
      schedule: { frequency: 'DAILY', times: ['08:00'] },
    });
    return { ...u, med: m, scheduleId: m.schedules[0].id as string };
  }
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  it('applies logs idempotently and reports adherence', async () => {
    const { auth, med, scheduleId } = await setup();
    const today = new Date().toISOString().slice(0, 10);
    // Make the medicine look like it was added days ago so earlier doses count.
    await t.db.medication.update({ where: { id: med.id }, data: { createdAt: new Date('2020-01-01T00:00:00Z') } });
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const item = {
      clientId: uuid(1), medicationId: med.id, scheduleId, scheduledFor: `${yesterday}T08:00:00.000Z`,
      status: 'TAKEN', takenAt: `${yesterday}T08:05:00.000Z`, loggedAt: `${yesterday}T08:05:00.000Z`,
    };
    const first = await api.post('/api/v1/dose-logs/sync').set(auth).send({ logs: [item] });
    expect(first.body.results).toEqual([{ clientId: uuid(1), result: 'applied' }]);
    const retry = await api.post('/api/v1/dose-logs/sync').set(auth).send({ logs: [item] });
    expect(retry.body.results[0].result).toBe('duplicate');
    expect(await t.db.medicationLog.count()).toBe(1);

    const week = await api.get('/api/v1/adherence/weekly').set(auth);
    expect(week.status).toBe(200);
    expect(week.body.days).toHaveLength(7);
    expect(week.body.days.at(-1).date).toBe(today);
    expect(week.body.days.find((d: { date: string }) => d.date === yesterday)).toMatchObject({ taken: 1, percent: 100 });
    expect(week.body.medications[0]).toMatchObject({ name: 'Metformin', taken: 1 });
  });

  it('newest action wins across devices, and undo removes the outcome', async () => {
    const { auth, med, scheduleId } = await setup();
    const base = { medicationId: med.id, scheduleId, scheduledFor: '2026-09-20T08:00:00.000Z' };
    await api.post('/api/v1/dose-logs/sync').set(auth).send({ logs: [{ ...base, clientId: uuid(1), status: 'SKIPPED', skipReason: 'FORGOT', loggedAt: '2026-09-20T09:00:00.000Z' }] });
    await api.post('/api/v1/dose-logs/sync').set(auth).send({ logs: [{ ...base, clientId: uuid(2), status: 'TAKEN', takenAt: '2026-09-20T09:10:00.000Z', loggedAt: '2026-09-20T09:10:00.000Z' }] });

    // An older action arriving late (a phone that was offline) must not overwrite the newer one.
    const stale = await api.post('/api/v1/dose-logs/sync').set(auth).send({ logs: [{ ...base, clientId: uuid(3), status: 'SKIPPED', skipReason: 'OTHER', loggedAt: '2026-09-20T09:05:00.000Z' }] });
    expect(stale.body.results[0]).toMatchObject({ result: 'stale', current: { status: 'TAKEN' } });

    const undo = await api.post('/api/v1/dose-logs/sync').set(auth).send({ logs: [{ ...base, clientId: uuid(4), status: 'UNDONE', loggedAt: '2026-09-20T09:20:00.000Z' }] });
    expect(undo.body.results[0].result).toBe('applied');
    expect(await t.db.medicationLog.count()).toBe(0);
  });

  it("rejects logs for someone else's medicine and hides other patients", async () => {
    const a = await setup();
    const b = await signUp(api, { email: 'b@example.com', timezone: 'UTC' });
    const res = await api.post('/api/v1/dose-logs/sync').set(b.auth).send({
      logs: [{ clientId: uuid(9), medicationId: a.med.id, scheduleId: a.scheduleId, scheduledFor: '2026-09-20T08:00:00.000Z', status: 'TAKEN', takenAt: '2026-09-20T08:00:00.000Z', loggedAt: '2026-09-20T08:00:00.000Z' }],
    });
    expect(res.body.results[0]).toMatchObject({ result: 'rejected' });
    expect(await t.db.medicationLog.count()).toBe(0);
    expect((await api.get(`/api/v1/adherence/weekly?patientId=${a.user.id}`).set(b.auth)).status).toBe(404);
  });

  it('validates input', async () => {
    const { auth, med, scheduleId } = await setup();
    const bad = await api.post('/api/v1/dose-logs/sync').set(auth).send({ logs: [{ clientId: uuid(1), medicationId: med.id, scheduleId, scheduledFor: '2026-09-20T08:00:00.000Z', status: 'TAKEN', loggedAt: '2026-09-20T08:00:00.000Z' }] });
    expect(bad.status).toBe(422); // TAKEN without takenAt
    expect((await api.get('/api/v1/adherence?from=2026-01-01&to=2026-12-31').set(auth)).status).toBe(400);
  });
});
