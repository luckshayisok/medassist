import { api } from '@/services/api/client';
import type { FoodTiming } from '@/types/medication';

/** What the patient lets a caregiver do (seeing medicines and progress is always included). */
export type Grantable = 'manage_medications' | 'receive_alerts';

export interface Tally {
  scheduled: number;
  taken: number;
  skipped: number;
  missed: number;
  pending: number;
  late: number;
  percent: number | null;
}

export interface Invite {
  code: string;
  expiresAt: string;
  permissions: string[];
}

export interface LinkedCaregiver {
  id: string;
  name: string;
  email: string;
  permissions: string[];
  since: string;
}

export interface CaredPerson {
  id: string;
  name: string;
  permissions: string[];
  today: Tally & { next: { time: string; medication: string } | null };
  week: Tally;
}

export interface CaredPersonDetail {
  id: string;
  name: string;
  permissions: string[];
  date: string;
  today: { medicationId: string; medication: string; dosage: string; time: string; outcome: 'TAKEN' | 'SKIPPED' | 'MISSED' | 'PENDING'; late: boolean }[];
  week: Tally;
  days: (Tally & { date: string })[];
  medications: { id: string; name: string; dosage: string; doseQuantity: number; unit: string; foodTiming: FoodTiming; times: string[] }[];
}

export interface CareAlert {
  id: string;
  patientId: string;
  patientName: string;
  medication: string;
  scheduledFor: string;
  seen: boolean;
}

export const caregiversApi = {
  // Patient side
  list: () => api<{ caregivers: LinkedCaregiver[]; invite: Invite | null }>('/caregivers'),
  invite: (permissions: Grantable[]) => api<Invite>('/caregivers/invite', { method: 'POST', body: { permissions } }),
  cancelInvite: () => api<void>('/caregivers/invite', { method: 'DELETE' }),
  setPermissions: (id: string, permissions: Grantable[]) => api<{ id: string; permissions: string[] }>(`/caregivers/${id}`, { method: 'PATCH', body: { permissions } }),
  remove: (id: string) => api<void>(`/caregivers/${id}`, { method: 'DELETE' }),
};

export const careApi = {
  // Caregiver side
  accept: (code: string) => api<{ patient: { id: string; name: string }; permissions: string[] }>('/care/accept', { method: 'POST', body: { code } }),
  patients: () => api<CaredPerson[]>('/care/patients'),
  patient: (id: string) => api<CaredPersonDetail>(`/care/patients/${id}`),
  leave: (id: string) => api<void>(`/care/patients/${id}`, { method: 'DELETE' }),
  alerts: () => api<CareAlert[]>('/care/alerts'),
  markSeen: (ids: string[]) => api<void>('/care/alerts/seen', { method: 'POST', body: { ids } }),
};

/** The two choices shown to the patient, in plain words. */
export const hasGrant = (permissions: string[], g: Grantable) => permissions.includes(g);
