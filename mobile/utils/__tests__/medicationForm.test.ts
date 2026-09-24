import type { Medication } from '../../types/medication';
import { describeFrequency, formatDose, formatQuantity } from '../format';
import {
  durationDays,
  emptyForm,
  endDateForDuration,
  fromMedication,
  mapServerFields,
  toPayload,
  validate,
} from '../medicationForm';

const valid = () => ({
  ...emptyForm(new Date(2026, 8, 24)),
  name: ' Metformin ',
  dosage: '500 mg',
  foodTiming: 'AFTER_FOOD' as const,
});

describe('validate', () => {
  it('requires name, strength and an explicit food choice (never assumed)', () => {
    const e = validate(emptyForm());
    expect(e).toMatchObject({ name: expect.any(String), dosage: expect.any(String), foodTiming: expect.any(String) });
    expect(validate(valid())).toEqual({});
  });

  it('requires days for certain-days schedules and at least one time', () => {
    expect(validate({ ...valid(), frequency: 'SPECIFIC_DAYS', daysOfWeek: [] }).daysOfWeek).toBeDefined();
    expect(validate({ ...valid(), times: [] }).times).toBeDefined();
  });

  it('rejects an end date before the start', () => {
    expect(validate({ ...valid(), endDate: '2026-09-01' }).endDate).toBeDefined();
  });
});

describe('toPayload', () => {
  it('trims, dedupes and sorts times, and nulls empty optional text', () => {
    const p = toPayload({ ...valid(), times: ['20:00', '08:00', '20:00'], avoid: [' Alcohol ', ''], notes: '  ' });
    expect(p).toMatchObject({
      name: 'Metformin',
      notes: null,
      avoid: ['Alcohol'],
      schedule: { frequency: 'DAILY', times: ['08:00', '20:00'], daysOfWeek: [], intervalDays: null },
    });
  });

  it('only sends the fields relevant to the chosen frequency', () => {
    const days = toPayload({ ...valid(), frequency: 'SPECIFIC_DAYS', daysOfWeek: [5, 1], intervalDays: 4 });
    expect(days.schedule).toMatchObject({ daysOfWeek: [1, 5], intervalDays: null });
    const every = toPayload({ ...valid(), frequency: 'EVERY_N_DAYS', daysOfWeek: [1], intervalDays: 3 });
    expect(every.schedule).toMatchObject({ daysOfWeek: [], intervalDays: 3 });
  });
});

describe('course length', () => {
  it('is inclusive and round-trips', () => {
    expect(endDateForDuration('2026-09-24', 7)).toBe('2026-09-30');
    expect(endDateForDuration('2026-10-28', 7)).toBe('2026-11-03'); // across a month (and EU DST) boundary
    expect(durationDays('2026-09-24', '2026-09-30')).toBe(7);
    expect(durationDays('2026-09-24', null)).toBeNull();
  });
});

describe('fromMedication', () => {
  it('only makes prescription-entered warnings editable', () => {
    const med = {
      id: 'm', patientId: 'p', name: 'X', dosage: '1 mg', doseQuantity: 1, unit: 'tablet', imageUrl: null, instructions: null,
      foodTiming: 'ANY', foodInstructions: null, precautions: null, prescriber: null, notes: null, startDate: '2026-01-01', endDate: null, version: 3,
      avoid: [
        { text: 'Mine', source: { kind: 'prescription' } },
        { text: 'Verified', source: { kind: 'verified', source: 'DailyMed' } },
      ],
      schedules: [
        { id: 'b', time: '20:00', frequency: 'DAILY', daysOfWeek: [], intervalDays: null, startDate: '2026-01-01', endDate: null },
        { id: 'a', time: '08:00', frequency: 'DAILY', daysOfWeek: [], intervalDays: null, startDate: '2026-01-01', endDate: null },
      ],
    } as Medication;
    const f = fromMedication(med);
    expect(f.avoid).toEqual(['Mine']);
    expect(f.times).toEqual(['08:00', '20:00']);
  });
});

describe('server errors', () => {
  it('maps nested schedule paths onto form fields', () => {
    expect(mapServerFields([{ path: 'schedule.times.0', message: 'bad' }, { path: 'name', message: 'n' }])).toEqual({ times: 'bad', name: 'n' });
  });
});

describe('formatting', () => {
  it('shows fractions the way people say them', () => {
    expect(formatQuantity(0.5)).toBe('½');
    expect(formatQuantity(1.5)).toBe('1½');
    expect(formatQuantity(2)).toBe('2');
    expect(formatDose({ doseQuantity: 0.5, unit: 'tablet' })).toBe('½ tablet');
    expect(formatDose({ doseQuantity: 2, unit: 'drop' })).toBe('2 drops');
  });

  it('describes frequency in plain words', () => {
    expect(describeFrequency({ frequency: 'DAILY', daysOfWeek: [], intervalDays: null })).toBe('Every day');
    expect(describeFrequency({ frequency: 'SPECIFIC_DAYS', daysOfWeek: [1, 3, 5], intervalDays: null })).toBe('Mon, Wed, Fri');
    expect(describeFrequency({ frequency: 'EVERY_N_DAYS', daysOfWeek: [], intervalDays: 3 })).toBe('Every 3 days');
  });
});
