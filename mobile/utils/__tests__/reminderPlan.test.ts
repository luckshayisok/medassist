import type { DoseLog, Medication } from '../../types/medication';
import { atLocalTime } from '../date';
import { planReminders } from '../reminderPlan';
import { makeDoseKey } from '../schedule';

const day = new Date(2026, 8, 24); // Thu 24 Sep 2026
const at = (hhmm: string, d = day) => atLocalTime(d, hhmm);

function med(id: string, times: string[], extra: Partial<Medication> = {}): Medication {
  return {
    id, patientId: 'p', name: id, dosage: '10 mg', doseQuantity: 1, unit: 'tablet', imageUrl: null, instructions: null,
    foodTiming: 'AFTER_FOOD', foodInstructions: null, avoid: [], precautions: null, prescriber: null, notes: null,
    startDate: '2026-01-01', endDate: null, version: 1,
    schedules: times.map((time, i) => ({ id: `${id}-${i}`, time, frequency: 'DAILY', daysOfWeek: [], intervalDays: null, startDate: '2026-01-01', endDate: null })),
    ...extra,
  };
}

const log = (doseKey: string, patch: Partial<DoseLog>): DoseLog => ({
  clientId: 'c', doseKey, medicationId: 'm', scheduleId: 's', scheduledFor: '', status: 'TAKEN', loggedAt: '', synced: false, ...patch,
});

describe('planReminders', () => {
  it('schedules future doses in a rolling window with deterministic ids', () => {
    const plan = planReminders([med('Metformin', ['08:00', '20:00'])], {}, at('12:00'), { horizonDays: 2, followUpMinutes: null });
    expect(plan.map((r) => [r.kind, r.fireAt.getDate(), r.fireAt.getHours()])).toEqual([
      ['dose', 24, 20],
      ['dose', 25, 8],
      ['dose', 25, 20],
    ]);
    expect(plan[0]!.id).toBe(`dose:${makeDoseKey('Metformin-0', at('20:00')).replace('Metformin-0', 'Metformin-1')}`);
    expect(plan[0]!.title).toBe('💊 Time for Metformin 10 mg');
    expect(plan[0]!.body).toBe('Take 1 tablet · After food');
  });

  it('skips doses already taken or skipped, and cancels their follow-up', () => {
    const k = makeDoseKey('A-0', at('20:00'));
    const plan = planReminders([med('A', ['20:00'])], { [k]: log(k, { status: 'TAKEN' }) }, at('19:00'), { horizonDays: 1 });
    expect(plan).toEqual([]);
  });

  it('replaces the dose reminder with the snooze time', () => {
    const k = makeDoseKey('A-0', at('08:00'));
    const plan = planReminders([med('A', ['08:00'])], { [k]: log(k, { status: 'SNOOZED', snoozedUntil: at('08:30').toISOString() }) }, at('08:05'), { horizonDays: 1 });
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ id: `snooze:${k}`, kind: 'snooze' });
    expect(plan[0]!.fireAt.getMinutes()).toBe(30);
  });

  it('adds a follow-up nudge 30 min later that never suggests doubling up', () => {
    const plan = planReminders([med('A', ['08:00'])], {}, at('08:10'), { horizonDays: 1 });
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ kind: 'followup' });
    expect(plan[0]!.fireAt.getMinutes()).toBe(30);
    expect(plan[0]!.body).not.toMatch(/double|extra|two/i);
  });

  it('only plans follow-ups within the next 24 hours', () => {
    const plan = planReminders([med('A', ['08:00'])], {}, at('07:00'), { horizonDays: 3 });
    expect(plan.filter((r) => r.kind === 'followup')).toHaveLength(1);
    expect(plan.filter((r) => r.kind === 'dose')).toHaveLength(3);
  });

  it('respects end dates and weekday schedules', () => {
    const ended = med('Old', ['09:00'], {});
    ended.schedules[0]!.endDate = '2026-09-24';
    const weekly = med('Weekly', ['09:00']);
    weekly.schedules[0]!.frequency = 'SPECIFIC_DAYS';
    weekly.schedules[0]!.daysOfWeek = [6]; // Saturday 26 Sep
    const plan = planReminders([ended, weekly], {}, at('08:00'), { horizonDays: 4, followUpMinutes: null });
    expect(plan.map((r) => `${r.doseKey.split('@')[0]}:${r.fireAt.getDate()}`)).toEqual(['Old-0:24', 'Weekly-0:26']);
  });

  it('caps the total (iOS allows 64 pending) keeping the soonest', () => {
    const many = Array.from({ length: 10 }, (_, i) => med(`M${i}`, ['08:00', '12:00', '16:00', '20:00']));
    const plan = planReminders(many, {}, at('07:00'), { horizonDays: 4, max: 60 });
    expect(plan).toHaveLength(60);
    const times = plan.map((r) => r.fireAt.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('keeps 8 AM at 8 AM across a DST change (wall-clock scheduling)', () => {
    // 29 Mar 2026 is the EU spring-forward date; in any timezone the wall-clock hour must hold.
    const plan = planReminders([med('A', ['08:00'])], {}, new Date(2026, 2, 27, 12), { horizonDays: 4, followUpMinutes: null });
    expect(plan.every((r) => r.fireAt.getHours() === 8 && r.fireAt.getMinutes() === 0)).toBe(true);
  });
});
