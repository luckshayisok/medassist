import { api } from '@/services/api/client';
import type { AuthSession, Me, PatientProfile, Role } from '@/types/auth';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role: Role;
  timezone: string;
}

export const authApi = {
  register: (input: RegisterInput) => api<AuthSession>('/auth/register', { method: 'POST', body: input, auth: false }),
  login: (email: string, password: string) =>
    api<AuthSession>('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  logout: (refreshToken: string) => api<void>('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }),
  me: () => api<Me>('/me'),
  updateProfile: (patch: Partial<PatientProfile> & { name?: string; timezone?: string }) =>
    api<Me>('/me/profile', { method: 'PATCH', body: patch }),
  deleteAccount: (password: string) => api<void>('/me', { method: 'DELETE', body: { password } }),
};

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
