import type { FoodTiming } from './medication';

export type PrescriptionStatus = 'UPLOADED' | 'PROCESSING' | 'NEEDS_REVIEW' | 'VERIFIED' | 'FAILED';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
export type DraftField = 'name' | 'strength' | 'form' | 'dose' | 'frequency' | 'timesOfDay' | 'foodTiming' | 'duration' | 'instructions';

/** One medicine as read from the paper — every field "as written", null when not readable. */
export interface DraftMedication {
  id: string;
  name: string | null;
  strength: string | null;
  form: string | null;
  dose: string | null;
  frequency: string | null;
  timesOfDay: TimeOfDay[];
  foodTiming: Exclude<FoodTiming, 'ANY'> | null;
  foodInstructions: string | null;
  duration: string | null;
  instructions: string | null;
  sourceText: string | null;
  confidence: number;
  unclearFields: DraftField[];
  verified: boolean;
}

export interface Prescription {
  id: string;
  status: PrescriptionStatus;
  errorMessage: string | null;
  canRetry: boolean;
  imageUrl: string;
  prescriber: string | null;
  date: string | null;
  warnings: string[];
  rawText: string | null;
  verifiedAt: string | null;
  createdAt: string;
  medications: DraftMedication[];
}
