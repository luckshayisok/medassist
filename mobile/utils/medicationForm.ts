import type { PhotoChange } from '@/hooks/useMedications';
import type { DoseUnit, FoodTiming, Frequency, Medication, MedicationInput } from '@/types/medication';
import { fromDateKey, toDateKey } from './date';

export interface MedicationFormState {
  name: string;
  dosage: string;
  doseQuantity: number;
  unit: DoseUnit;
  times: string[];
  frequency: Frequency;
  daysOfWeek: number[];
  intervalDays: number;
  startDate: string;
  /** null = ongoing (no end date). */
  endDate: string | null;
  /** Must be chosen explicitly — we never guess food instructions. */
  foodTiming: FoodTiming | null;
  foodInstructions: string;
  instructions: string;
  avoid: string[];
  precautions: string;
  prescriber: string;
  notes: string;
  photo: PhotoChange;
  /** Existing photo URL (edit mode), for preview. */
  existingImageUrl: string | null;
}

export type FormErrors = Partial<Record<keyof MedicationFormState | 'form', string>>;

export function emptyForm(today = new Date()): MedicationFormState {
  return {
    name: '',
    dosage: '',
    doseQuantity: 1,
    unit: 'tablet',
    times: ['08:00'],
    frequency: 'DAILY',
    daysOfWeek: [],
    intervalDays: 2,
    startDate: toDateKey(today),
    endDate: null,
    foodTiming: null,
    foodInstructions: '',
    instructions: '',
    avoid: [],
    precautions: '',
    prescriber: '',
    notes: '',
    photo: { kind: 'keep' },
    existingImageUrl: null,
  };
}

export function fromMedication(m: Medication): MedicationFormState {
  const s = m.schedules[0];
  return {
    name: m.name,
    dosage: m.dosage,
    doseQuantity: m.doseQuantity,
    unit: m.unit,
    times: m.schedules.map((x) => x.time).sort(),
    frequency: s?.frequency ?? 'DAILY',
    daysOfWeek: s?.daysOfWeek ?? [],
    intervalDays: s?.intervalDays ?? 2,
    startDate: m.startDate,
    endDate: m.endDate,
    foodTiming: m.foodTiming,
    foodInstructions: m.foodInstructions ?? '',
    instructions: m.instructions ?? '',
    // Only user-entered (prescription) items are editable; verified info is managed by the knowledge base.
    avoid: m.avoid.filter((a) => a.source.kind === 'prescription').map((a) => a.text),
    precautions: m.precautions ?? '',
    prescriber: m.prescriber ?? '',
    notes: m.notes ?? '',
    photo: { kind: 'keep' },
    existingImageUrl: m.imageUrl,
  };
}

/** Inclusive: a 7-day course starting on the 1st ends on the 7th. */
export function endDateForDuration(startDate: string, days: number): string {
  const d = fromDateKey(startDate);
  d.setDate(d.getDate() + days - 1);
  return toDateKey(d);
}

export function durationDays(startDate: string, endDate: string | null): number | null {
  if (!endDate) return null;
  const a = fromDateKey(startDate);
  const b = fromDateKey(endDate);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000) + 1;
}

export function validate(f: MedicationFormState): FormErrors {
  const e: FormErrors = {};
  if (!f.name.trim()) e.name = 'Enter the medicine name';
  if (!f.dosage.trim()) e.dosage = 'Enter the strength, e.g. 500 mg';
  if (f.doseQuantity < 0.25 || !Number.isInteger(f.doseQuantity * 4)) e.doseQuantity = 'Choose how much to take';
  if (f.times.length === 0) e.times = 'Add at least one time';
  if (f.frequency === 'SPECIFIC_DAYS' && f.daysOfWeek.length === 0) e.daysOfWeek = 'Choose at least one day';
  if (!f.foodTiming) e.foodTiming = 'Choose when to take it with food';
  if (f.endDate && f.endDate < f.startDate) e.endDate = 'End date must be after the start date';
  return e;
}

const orNull = (s: string) => (s.trim() ? s.trim() : null);

export function toPayload(f: MedicationFormState): MedicationInput {
  return {
    name: f.name.trim(),
    dosage: f.dosage.trim(),
    doseQuantity: f.doseQuantity,
    unit: f.unit,
    instructions: orNull(f.instructions),
    foodTiming: f.foodTiming!,
    foodInstructions: orNull(f.foodInstructions),
    avoid: f.avoid.map((a) => a.trim()).filter(Boolean),
    precautions: orNull(f.precautions),
    prescriber: orNull(f.prescriber),
    notes: orNull(f.notes),
    startDate: f.startDate,
    endDate: f.endDate,
    schedule: {
      frequency: f.frequency,
      times: [...new Set(f.times)].sort(),
      daysOfWeek: f.frequency === 'SPECIFIC_DAYS' ? [...f.daysOfWeek].sort() : [],
      intervalDays: f.frequency === 'EVERY_N_DAYS' ? f.intervalDays : null,
    },
  };
}

/** Map API field errors ("schedule.times", "foodTiming"…) onto form fields. */
export function mapServerFields(fields: { path: string; message: string }[] = []): FormErrors {
  const e: FormErrors = {};
  for (const { path, message } of fields) {
    const key = path.startsWith('schedule.') ? (path.split('.')[1] as keyof MedicationFormState) : (path.split('.')[0] as keyof MedicationFormState);
    e[key] ??= message;
  }
  return e;
}
