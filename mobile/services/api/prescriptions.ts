import { Platform } from 'react-native';
import { api } from '@/services/api/client';
import type { Medication, MedicationInput } from '@/types/medication';
import type { Prescription } from '@/types/prescription';

async function imageForm(localUri: string) {
  const form = new FormData();
  if (Platform.OS === 'web') {
    form.append('image', await (await fetch(localUri)).blob(), 'prescription.jpg');
  } else {
    form.append('image', { uri: localUri, name: 'prescription.jpg', type: 'image/jpeg' } as unknown as Blob);
  }
  return form;
}

export const prescriptionsApi = {
  list: () => api<Prescription[]>('/prescriptions'),
  get: (id: string) => api<Prescription>(`/prescriptions/${id}`),
  upload: async (localUri: string) => api<Prescription>('/prescriptions', { method: 'POST', body: await imageForm(localUri) }),
  retry: (id: string) => api<Prescription>(`/prescriptions/${id}/process`, { method: 'POST' }),
  verify: (id: string, medications: { draftId: string | null; medication: MedicationInput }[]) =>
    api<{ prescription: Prescription; medications: Medication[] }>(`/prescriptions/${id}/verify`, {
      method: 'PATCH',
      body: { confirmed: true, medications },
    }),
  remove: (id: string) => api<void>(`/prescriptions/${id}`, { method: 'DELETE' }),
};
