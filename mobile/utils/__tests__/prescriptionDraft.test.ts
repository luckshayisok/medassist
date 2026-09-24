import type { DraftMedication } from '../../types/prescription';
import { validate } from '../medicationForm';
import { daysFromDuration, draftToForm, quantityFromDose, unitFromForm } from '../prescriptionDraft';

const draft = (patch: Partial<DraftMedication> = {}): DraftMedication => ({
  id: 'd1', name: 'Metformin', strength: '500 mg', form: 'tablet', dose: '1 tablet', frequency: '1-0-1',
  timesOfDay: ['morning', 'night'], foodTiming: 'AFTER_FOOD', foodInstructions: 'After food', duration: '30 days',
  instructions: null, sourceText: 'Tab Metformin 500mg 1-0-1 PC x 30 days', confidence: 0.95, unclearFields: [], verified: false, ...patch,
});
const today = new Date(2026, 8, 24);

describe('parsing helpers', () => {
  it('reads dose quantities', () => {
    expect(quantityFromDose('1 tablet')).toBe(1);
    expect(quantityFromDose('½ tab')).toBe(0.5);
    expect(quantityFromDose('1/2')).toBe(0.5);
    expect(quantityFromDose('2 puffs')).toBe(2);
    expect(quantityFromDose('as needed')).toBeNull();
    expect(quantityFromDose(null)).toBeNull();
  });

  it('reads durations', () => {
    expect(daysFromDuration('30 days')).toBe(30);
    expect(daysFromDuration('2 weeks')).toBe(14);
    expect(daysFromDuration('1 month')).toBe(30);
    expect(daysFromDuration('till next visit')).toBeNull();
  });

  it('maps medicine forms to units', () => {
    expect(unitFromForm('Tab')).toBe('tablet');
    expect(unitFromForm('syrup')).toBe('ml');
    expect(unitFromForm(null, '2 puffs')).toBe('puff');
    expect(unitFromForm('something odd')).toBeNull();
  });
});

describe('draftToForm', () => {
  it('pre-fills a clear entry and still asks the patient to confirm the times', () => {
    const { form, attention } = draftToForm(draft(), 'Dr. A. Sharma', today);
    expect(form).toMatchObject({
      name: 'Metformin', dosage: '500 mg', doseQuantity: 1, unit: 'tablet', times: ['08:00', '21:00'],
      foodTiming: 'AFTER_FOOD', endDate: '2026-10-23', prescriber: 'Dr. A. Sharma',
    });
    expect(attention.map((a) => a.field)).toEqual(['times']);
    expect(validate(form)).toEqual({});
  });

  it('never guesses: unreadable name, missing times and food timing block saving until the patient fills them', () => {
    const { form, attention } = draftToForm(
      draft({ name: null, unclearFields: ['name'], timesOfDay: [], frequency: 'BD', foodTiming: null, duration: null }),
      null,
      today,
    );
    expect(form.name).toBe('');
    expect(form.times).toEqual([]);
    expect(form.foodTiming).toBeNull();
    expect(form.endDate).toBeNull();
    expect(attention.map((a) => a.field)).toEqual(['name', 'times', 'foodTiming']);
    expect(Object.keys(validate(form)).sort()).toEqual(['foodTiming', 'name', 'times']);
  });
});
