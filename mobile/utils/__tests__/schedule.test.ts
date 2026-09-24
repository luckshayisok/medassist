import type { DoseLog, Medication, MedicationSchedule } from '../../types/medication';
import { summarize } from '../adherence';
import { atLocalTime } from '../date';
import { deriveStatus, minutesLate } from '../doseStatus';
import { expandDay, makeDoseKey, occursOn, pickNextDose } from '../schedule';

const day = new Date(2026, 8, 24); // Thu 24 Sep 2026, local
const at = (hhmm: string) => atLocalTime(day, hhmm);

function med(id: string, schedules: Partial<MedicationSchedule>[]): Medication {
  return {
    id,
    patientId: 'p1',
    name: id,
    dosage: '10 mg',
    doseQuantity: 1,
    unit: 'tablet',
    imageUrl: null,
    instructions: null,
    foodTiming: 'ANY',
    foodInstructions: null,
    avoid: [],
    precautions: null,
    prescriber: null,
    notes: null,
    startDate: '2026-01-01',
    endDate: null,
    version: 1,
    schedules: schedules.map((s, i) => ({
      id: `${id}-s${i}`,
      time: '08:00',
      frequency: 'DAILY',
      daysOfWeek: [],
      intervalDays: null,
      startDate: '2026-01-01',
      endDate: null,
      ...s,
    })),
  };
}

function log(doseKey: string, patch: Partial<DoseLog>): DoseLog {
  return {
    clientId: 'c',
    doseKey,
    medicationId: 'm',
    scheduleId: 's',
    scheduledFor: '',
    status: 'TAKEN',
    loggedAt: '',
    synced: false,
    ...patch,
  };
}

describe('occursOn', () => {
  const base: MedicationSchedule = { id: 's', time: '08:00', frequency: 'DAILY', daysOfWeek: [], intervalDays: null, startDate: '2026-09-24', endDate: null };

  it('respects start and inclusive end dates', () => {
    expect(occursOn(base, day)).toBe(true);
    expect(occursOn({ ...base, startDate: '2026-09-25' }, day)).toBe(false);
    expect(occursOn({ ...base, endDate: '2026-09-24' }, day)).toBe(true);
    expect(occursOn({ ...base, endDate: '2026-09-23' }, day)).toBe(false);
  });

  it('handles specific weekdays', () => {
    expect(occursOn({ ...base, frequency: 'SPECIFIC_DAYS', daysOfWeek: [4] }, day)).toBe(true); // Thursday
    expect(occursOn({ ...base, frequency: 'SPECIFIC_DAYS', daysOfWeek: [1, 3] }, day)).toBe(false);
  });

  it('handles every-N-days counted from the start date', () => {
    const s = { ...base, frequency: 'EVERY_N_DAYS' as const, intervalDays: 2, startDate: '2026-09-20' };
    expect(occursOn(s, new Date(2026, 8, 22))).toBe(true);
    expect(occursOn(s, new Date(2026, 8, 23))).toBe(false);
    expect(occursOn(s, day)).toBe(true);
  });

  it('keeps wall-clock time across a month/DST boundary', () => {
    const d = atLocalTime(new Date(2026, 2, 29), '08:00'); // EU DST switch date
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(0);
  });
});

describe('deriveStatus', () => {
  it('is upcoming before, due within the window, missed after', () => {
    expect(deriveStatus(at('08:00'), at('07:59'))).toBe('UPCOMING');
    expect(deriveStatus(at('08:00'), at('08:00'))).toBe('DUE_NOW');
    expect(deriveStatus(at('08:00'), at('09:00'))).toBe('DUE_NOW');
    expect(deriveStatus(at('08:00'), at('09:01'))).toBe('MISSED');
  });

  it('logged outcomes win over time', () => {
    expect(deriveStatus(at('08:00'), at('23:00'), log('k', { status: 'TAKEN' }))).toBe('TAKEN');
    expect(deriveStatus(at('08:00'), at('07:00'), log('k', { status: 'SKIPPED' }))).toBe('SKIPPED');
  });

  it('snoozed becomes due again after the snooze ends', () => {
    const l = log('k', { status: 'SNOOZED', snoozedUntil: at('08:30').toISOString() });
    expect(deriveStatus(at('08:00'), at('08:20'), l)).toBe('SNOOZED');
    expect(deriveStatus(at('08:00'), at('08:31'), l)).toBe('DUE_NOW');
    expect(deriveStatus(at('08:00'), at('09:31'), l)).toBe('MISSED');
  });

  it('computes lateness', () => {
    expect(minutesLate(at('08:00'), at('08:07'))).toBe(7);
    expect(minutesLate(at('08:00'), at('07:50'))).toBe(0);
  });
});

describe('expandDay + pickNextDose', () => {
  const meds = [
    med('Metformin', [{ time: '08:00' }, { time: '20:00' }]),
    med('Aspirin', [{ time: '13:00' }]),
    med('Old', [{ time: '09:00', endDate: '2026-09-01' }]),
  ];

  it('expands only active schedules, sorted by time', () => {
    const events = expandDay(meds, day, {}, at('07:00'));
    expect(events.map((e) => `${e.medication.name}@${e.scheduledFor.getHours()}`)).toEqual([
      'Metformin@8',
      'Aspirin@13',
      'Metformin@20',
    ]);
  });

  it('prefers a due dose, and never promotes a missed one', () => {
    const now = at('13:10');
    const events = expandDay(meds, day, {}, now);
    expect(events[0].status).toBe('MISSED');
    expect(pickNextDose(events, now)?.medication.name).toBe('Aspirin');

    const key = makeDoseKey('Aspirin-s0', at('13:00'));
    const after = expandDay(meds, day, { [key]: log(key, { status: 'TAKEN' }) }, now);
    expect(pickNextDose(after, now)?.scheduledFor.getHours()).toBe(20);
  });

  it('returns undefined when the day is finished', () => {
    const now = at('23:30');
    expect(pickNextDose(expandDay(meds, day, {}, now), now)).toBeUndefined();
  });
});

describe('summarize', () => {
  it('counts only resolved doses toward the percentage', () => {
    const meds = [med('A', [{ time: '08:00' }, { time: '12:00' }, { time: '20:00' }])];
    const k1 = makeDoseKey('A-s0', at('08:00'));
    const events = expandDay(meds, day, { [k1]: log(k1, { status: 'TAKEN' }) }, at('14:00'));
    // 08:00 taken, 12:00 missed, 20:00 upcoming
    expect(summarize(events)).toEqual({ taken: 1, resolved: 2, totalScheduled: 3, percent: 50 });
  });

  it('returns null percent when nothing is resolved', () => {
    expect(summarize([]).percent).toBeNull();
  });
});
