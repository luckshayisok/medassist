export type FoodTiming = 'BEFORE_FOOD' | 'AFTER_FOOD' | 'WITH_FOOD' | 'EMPTY_STOMACH' | 'ANY';

export type Frequency = 'DAILY' | 'SPECIFIC_DAYS' | 'EVERY_N_DAYS';

export const DOSE_UNITS = ['tablet', 'capsule', 'ml', 'drop', 'puff', 'unit', 'sachet', 'spoon', 'patch', 'injection'] as const;
export type DoseUnit = (typeof DOSE_UNITS)[number];

/** Where a piece of shown information came from. Always displayed to the user. */
export type InfoSource =
  | { kind: 'prescription' }
  | { kind: 'verified'; source: string; url?: string }
  | { kind: 'general' };

export interface AvoidItem {
  text: string;
  source: InfoSource;
}

export interface MedicationSchedule {
  id: string;
  /** Wall-clock time in the patient's local timezone, "HH:mm". Keeps DST handling correct. */
  time: string;
  frequency: Frequency;
  /** 0 = Sunday … 6 = Saturday. Used when frequency is SPECIFIC_DAYS. */
  daysOfWeek: number[];
  /** Used when frequency is EVERY_N_DAYS, counted from startDate. */
  intervalDays: number | null;
  startDate: string; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD, inclusive
}

/** Mirrors the API's medication resource. */
export interface Medication {
  id: string;
  patientId: string;
  name: string;
  /** Strength, e.g. "500 mg". */
  dosage: string;
  doseQuantity: number;
  unit: DoseUnit;
  /** Relative, signed URL — resolve with resolveFileUrl(). */
  imageUrl: string | null;
  instructions: string | null;
  foodTiming: FoodTiming;
  foodInstructions: string | null;
  avoid: AvoidItem[];
  precautions: string | null;
  prescriber: string | null;
  notes: string | null;
  startDate: string;
  endDate: string | null;
  version: number;
  schedules: MedicationSchedule[];
}

/** Body for POST /medications (and, partially, PATCH). */
export interface MedicationInput {
  name: string;
  dosage: string;
  doseQuantity: number;
  unit: DoseUnit;
  instructions: string | null;
  foodTiming: FoodTiming;
  foodInstructions: string | null;
  avoid: string[];
  precautions: string | null;
  prescriber: string | null;
  notes: string | null;
  startDate: string;
  endDate: string | null;
  schedule: {
    frequency: Frequency;
    times: string[];
    daysOfWeek: number[];
    intervalDays: number | null;
  };
}

export type DoseStatus = 'UPCOMING' | 'DUE_NOW' | 'TAKEN' | 'SNOOZED' | 'SKIPPED' | 'MISSED';

export type SkipReason = 'FORGOT' | 'UNWELL' | 'RAN_OUT' | 'DOCTOR_ADVISED' | 'OTHER';

export interface DoseLog {
  /** Client-generated id so offline logs sync idempotently. */
  clientId: string;
  doseKey: string;
  medicationId: string;
  scheduleId: string;
  scheduledFor: string; // ISO
  status: 'TAKEN' | 'SKIPPED' | 'SNOOZED';
  takenAt?: string; // ISO
  snoozedUntil?: string; // ISO
  skipReason?: SkipReason;
  skipNote?: string;
  loggedAt: string; // ISO
  synced: boolean;
}

export interface DoseEvent {
  doseKey: string;
  medication: Medication;
  scheduleId: string;
  scheduledFor: Date;
  status: DoseStatus;
  log?: DoseLog;
}
