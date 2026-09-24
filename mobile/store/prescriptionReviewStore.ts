import { create } from 'zustand';
import type { Prescription } from '@/types/prescription';
import { draftToForm, type DraftForm } from '@/utils/prescriptionDraft';
import type { MedicationFormState } from '@/utils/medicationForm';

export interface ReviewItem extends DraftForm {
  draftId: string;
  include: boolean;
  /** The patient opened and saved this one — attention notes are then considered handled. */
  checked: boolean;
}

/** In-progress review of one scanned prescription (kept while the patient edits each medicine). */
interface ReviewState {
  byPrescription: Record<string, ReviewItem[]>;
  start: (p: Prescription) => void;
  setForm: (prescriptionId: string, index: number, form: MedicationFormState) => void;
  toggle: (prescriptionId: string, index: number) => void;
  clear: (prescriptionId: string) => void;
}

export const usePrescriptionReview = create<ReviewState>()((set, get) => ({
  byPrescription: {},
  start: (p) => {
    if (get().byPrescription[p.id]) return; // keep edits if the screen re-mounts
    const items = p.medications.map((d) => ({
      ...draftToForm(d, p.prescriber),
      draftId: d.id,
      // An entry without a readable name starts unselected: the patient has to opt in.
      include: !!d.name,
      checked: false,
    }));
    set((s) => ({ byPrescription: { ...s.byPrescription, [p.id]: items } }));
  },
  setForm: (id, index, form) =>
    set((s) => ({
      byPrescription: {
        ...s.byPrescription,
        [id]: (s.byPrescription[id] ?? []).map((it, i) => (i === index ? { ...it, form, checked: true, include: true } : it)),
      },
    })),
  toggle: (id, index) =>
    set((s) => ({
      byPrescription: { ...s.byPrescription, [id]: (s.byPrescription[id] ?? []).map((it, i) => (i === index ? { ...it, include: !it.include } : it)) },
    })),
  clear: (id) =>
    set((s) => {
      const { [id]: _drop, ...rest } = s.byPrescription;
      return { byPrescription: rest };
    }),
}));
