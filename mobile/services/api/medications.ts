import { Platform } from 'react-native';
import { api } from '@/services/api/client';
import type { Medication, MedicationInput } from '@/types/medication';

async function photoFormData(localUri: string) {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(localUri)).blob();
    form.append('image', blob, 'photo.jpg');
  } else {
    // React Native's FormData accepts a file descriptor object.
    form.append('image', { uri: localUri, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
  }
  return form;
}

export const medicationsApi = {
  list: () => api<Medication[]>('/medications'),
  get: (id: string) => api<Medication>(`/medications/${id}`),
  create: (input: MedicationInput) => api<Medication>('/medications', { method: 'POST', body: input }),
  update: (id: string, patch: Partial<MedicationInput> & { version: number }) =>
    api<Medication>(`/medications/${id}`, { method: 'PATCH', body: patch }),
  remove: (id: string) => api<void>(`/medications/${id}`, { method: 'DELETE' }),
  uploadImage: async (id: string, localUri: string) =>
    api<Medication>(`/medications/${id}/image`, { method: 'POST', body: await photoFormData(localUri) }),
  removeImage: (id: string) => api<Medication>(`/medications/${id}/image`, { method: 'DELETE' }),
};
