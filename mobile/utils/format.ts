import type { DoseUnit, FoodTiming, Medication, MedicationSchedule } from '@/types/medication';
import { fromDateKey } from './date';

export const UNIT_LABEL: Record<DoseUnit, { one: string; many: string }> = {
  tablet: { one: 'tablet', many: 'tablets' },
  capsule: { one: 'capsule', many: 'capsules' },
  ml: { one: 'ml', many: 'ml' },
  drop: { one: 'drop', many: 'drops' },
  puff: { one: 'puff', many: 'puffs' },
  unit: { one: 'unit', many: 'units' },
  sachet: { one: 'sachet', many: 'sachets' },
  spoon: { one: 'spoon', many: 'spoons' },
  patch: { one: 'patch', many: 'patches' },
  injection: { one: 'injection', many: 'injections' },
};

const FRACTIONS: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' };

/** 0.5 → "½", 1.5 → "1½", 2 → "2". */
export function formatQuantity(q: number): string {
  const whole = Math.floor(q);
  const frac = FRACTIONS[Math.round((q - whole) * 100) / 100] ?? '';
  if (!frac) return String(q);
  return whole ? `${whole}${frac}` : frac;
}

export function formatDose(m: Pick<Medication, 'doseQuantity' | 'unit'>): string {
  const label = UNIT_LABEL[m.unit] ?? { one: m.unit, many: m.unit };
  return `${formatQuantity(m.doseQuantity)} ${m.doseQuantity > 1 ? label.many : label.one}`;
}

export const FOOD_TIMING_LABEL: Record<FoodTiming, string> = {
  BEFORE_FOOD: 'Before food',
  AFTER_FOOD: 'After food',
  WITH_FOOD: 'With food',
  EMPTY_STOMACH: 'On an empty stomach',
  ANY: 'With or without food',
};

/** Short food line for cards: prefer the prescription's own wording. */
export function foodLine(m: Pick<Medication, 'foodTiming' | 'foodInstructions'>): string {
  return m.foodInstructions ?? FOOD_TIMING_LABEL[m.foodTiming];
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function describeFrequency(s: Pick<MedicationSchedule, 'frequency' | 'daysOfWeek' | 'intervalDays'> | undefined): string {
  if (!s) return '';
  switch (s.frequency) {
    case 'DAILY':
      return 'Every day';
    case 'SPECIFIC_DAYS':
      return s.daysOfWeek.length === 7 ? 'Every day' : s.daysOfWeek.map((d) => DAY_SHORT[d]).join(', ');
    case 'EVERY_N_DAYS':
      return `Every ${s.intervalDays} days`;
  }
}

export function formatDate(key: string): string {
  return fromDateKey(key).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function describeCourse(m: Pick<Medication, 'startDate' | 'endDate'>): string {
  return m.endDate ? `${formatDate(m.startDate)} to ${formatDate(m.endDate)}` : `Since ${formatDate(m.startDate)} · ongoing`;
}
