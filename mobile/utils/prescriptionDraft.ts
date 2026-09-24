import type { DraftField, DraftMedication, TimeOfDay } from '@/types/prescription';
import type { DoseUnit } from '@/types/medication';
import { emptyForm, endDateForDuration, type MedicationFormState } from './medicationForm';

/** Clock times used when the paper names a time of day (e.g. "1-0-1" → morning & night). */
export const TIME_FOR: Record<TimeOfDay, string> = { morning: '08:00', afternoon: '13:00', evening: '18:00', night: '21:00' };

const FORM_TO_UNIT: [RegExp, DoseUnit][] = [
  [/\b(tab|tablet)s?\b/i, 'tablet'],
  [/\b(cap|capsule)s?\b/i, 'capsule'],
  [/\b(syrup|syp|suspension|liquid|solution|ml)\b/i, 'ml'],
  [/\b(drop|drops|gtt)\b/i, 'drop'],
  [/\b(inhaler|puff|puffs|rotacap)\b/i, 'puff'],
  [/\b(inj|injection)\b/i, 'injection'],
  [/\b(sachet|powder)\b/i, 'sachet'],
  [/\b(patch)\b/i, 'patch'],
  [/\b(spoon|tsp|teaspoon)\b/i, 'spoon'],
];

export function unitFromForm(...texts: (string | null)[]): DoseUnit | null {
  const s = texts.filter(Boolean).join(' ');
  for (const [re, unit] of FORM_TO_UNIT) if (re.test(s)) return unit;
  return null;
}

/** "1 tablet" → 1, "½ tab" → 0.5, "1/2" → 0.5, "2 puffs" → 2. Unknown → null (keep default 1, flagged). */
export function quantityFromDose(dose: string | null): number | null {
  if (!dose) return null;
  const s = dose.trim();
  if (/^½/.test(s)) return 0.5;
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = s.match(/^(\d+(?:\.\d+)?)/);
  if (!n) return null;
  const v = Number(n[1]);
  return v > 0 && v <= 20 ? Math.round(v * 2) / 2 : null;
}

/** "30 days" / "2 weeks" / "1 month" → days. Anything else → null (course left ongoing, flagged). */
export function daysFromDuration(duration: string | null): number | null {
  if (!duration) return null;
  const m = duration.match(/(\d+)\s*(day|days|d|week|weeks|wk|month|months|mo)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  if (unit.startsWith('w')) return n * 7;
  if (unit.startsWith('mo') || unit.startsWith('month')) return n * 30;
  return n;
}

export interface DraftForm {
  form: MedicationFormState;
  /** Fields the patient must look at: unreadable, missing, or filled in from notation. */
  attention: { field: DraftField | 'times' | 'course'; message: string }[];
}

/** Turn one extracted medicine into a pre-filled (but not trusted) form. */
export function draftToForm(d: DraftMedication, prescriber: string | null, today = new Date()): DraftForm {
  const base = emptyForm(today);
  const attention: DraftForm['attention'] = [];
  const unclear = new Set(d.unclearFields);

  if (!d.name || unclear.has('name')) attention.push({ field: 'name', message: "I couldn't clearly read the medicine name. Please check it against the box or ask your pharmacist." });
  if (!d.strength || unclear.has('strength')) attention.push({ field: 'strength', message: 'The strength is missing or unclear. Please check it on the box.' });

  const qty = quantityFromDose(d.dose);
  if (qty === null) attention.push({ field: 'dose', message: 'How much to take each time was not clear. Please check.' });

  const times = [...new Set(d.timesOfDay.map((t) => TIME_FOR[t]))].sort();
  if (times.length) {
    attention.push({ field: 'times', message: `Times were filled in from "${d.frequency ?? 'the prescription'}". Adjust them to when you actually take it.` });
  } else {
    attention.push({ field: 'times', message: `The prescription says "${d.frequency ?? 'nothing clear'}" but not the exact times. Please add the times you take it.` });
  }

  if (!d.foodTiming) attention.push({ field: 'foodTiming', message: 'No food instruction was written. Choose what your doctor told you.' });

  const days = daysFromDuration(d.duration);
  if (d.duration && days === null) attention.push({ field: 'course', message: `The course length ("${d.duration}") needs checking.` });

  return {
    attention,
    form: {
      ...base,
      name: d.name ?? '',
      dosage: d.strength ?? '',
      doseQuantity: qty ?? 1,
      unit: unitFromForm(d.form, d.dose) ?? 'tablet',
      // Empty times are deliberate: the form won't save until the patient adds them.
      times,
      foodTiming: d.foodTiming,
      foodInstructions: d.foodInstructions ?? '',
      instructions: d.instructions ?? '',
      endDate: days ? endDateForDuration(base.startDate, days) : null,
      prescriber: prescriber ?? '',
    },
  };
}
