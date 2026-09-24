export type Role = 'PATIENT' | 'CAREGIVER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  timezone: string;
  createdAt: string;
}

export interface AuthSession {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface PatientProfile {
  dateOfBirth: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  accessibilitySettings: { textSize?: 'standard' | 'large' | 'xl'; highContrast?: boolean; readAloud?: boolean };
}

export interface Me {
  user: User;
  profile: PatientProfile | null;
}
