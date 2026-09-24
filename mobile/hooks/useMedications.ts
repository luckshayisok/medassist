import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { medicationsApi } from '@/services/api/medications';
import { useAuth } from '@/store/authStore';
import type { Medication, MedicationInput } from '@/types/medication';

export const medicationsKey = (userId: string | undefined) => ['medications', userId] as const;

/** The signed-in patient's medicines. Served from the persisted cache when offline. */
export function useMedicationsQuery() {
  const user = useAuth((s) => s.user);
  return useQuery({
    queryKey: medicationsKey(user?.id),
    queryFn: medicationsApi.list,
    // Caregivers have no list of their own; they see each person through the care screens.
    enabled: user?.role === 'PATIENT',
  });
}

export function useMedicationList(): Medication[] {
  return useMedicationsQuery().data ?? EMPTY;
}
const EMPTY: Medication[] = [];

export function useMedication(id: string | undefined) {
  const list = useMedicationList();
  return list.find((m) => m.id === id);
}

/** Photo change requested by the form, applied after the medicine itself is saved. */
export type PhotoChange = { kind: 'keep' } | { kind: 'set'; uri: string } | { kind: 'remove' };

interface SaveArgs {
  id?: string;
  version?: number;
  input: MedicationInput;
  photo: PhotoChange;
}

export function useSaveMedication(patientId?: string) {
  const qc = useQueryClient();
  const userId = useAuth((s) => s.user?.id);

  return useMutation({
    mutationFn: async ({ id, version, input, photo }: SaveArgs) => {
      let med = id ? await medicationsApi.update(id, { ...input, version: version! }) : await medicationsApi.create(input, patientId);
      if (photo.kind === 'set') med = await medicationsApi.uploadImage(med.id, photo.uri);
      if (photo.kind === 'remove' && med.imageUrl) med = await medicationsApi.removeImage(med.id);
      return med;
    },
    onSuccess: (med) => {
      if (patientId) {
        // Saved for someone this caregiver looks after: refresh their view.
        void qc.invalidateQueries({ queryKey: ['care'] });
        return;
      }
      qc.setQueryData<Medication[]>(medicationsKey(userId), (old = []) => {
        const rest = old.filter((m) => m.id !== med.id);
        return [...rest, med].sort((a, b) => a.name.localeCompare(b.name));
      });
      void qc.invalidateQueries({ queryKey: medicationsKey(userId) });
    },
  });
}

export function useDeleteMedication() {
  const qc = useQueryClient();
  const userId = useAuth((s) => s.user?.id);
  return useMutation({
    mutationFn: (id: string) => medicationsApi.remove(id),
    onSuccess: (_void, id) => {
      qc.setQueryData<Medication[]>(medicationsKey(userId), (old = []) => old.filter((m) => m.id !== id));
    },
  });
}
