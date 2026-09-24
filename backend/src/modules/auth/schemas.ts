import { z } from 'zod';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address').max(254));

const timezone = z
  .string()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown timezone');

export const RegisterSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name').max(100),
  email,
  // Long passphrases are welcome; argon2 handles any length, cap to stop DoS.
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(['PATIENT', 'CAREGIVER']),
  timezone: timezone.default('UTC'),
});

export const LoginSchema = z.object({
  email,
  password: z.string().min(1, 'Please enter your password').max(128),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});

export const UpdateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    timezone,
    dateOfBirth: z.iso.date().nullable(),
    emergencyContactName: z.string().trim().max(100).nullable(),
    emergencyContactPhone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{3,32}$/, 'Enter a valid phone number')
      .nullable(),
    accessibilitySettings: z
      .object({
        textSize: z.enum(['standard', 'large', 'xl']),
        highContrast: z.boolean(),
        readAloud: z.boolean(),
      })
      .partial()
      .strict(),
  })
  .partial()
  .strict();
