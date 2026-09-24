import { z } from 'zod';

export const DOSE_UNITS = ['tablet', 'capsule', 'ml', 'drop', 'puff', 'unit', 'sachet', 'spoon', 'patch', 'injection'] as const;
export const FOOD_TIMINGS = ['BEFORE_FOOD', 'AFTER_FOOD', 'WITH_FOOD', 'EMPTY_STOMACH', 'ANY'] as const;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm');
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));

export const ScheduleInput = z
  .object({
    frequency: z.enum(['DAILY', 'SPECIFIC_DAYS', 'EVERY_N_DAYS']),
    times: z
      .array(time)
      .min(1, 'Add at least one time')
      .max(8, 'At most 8 times a day')
      .refine((t) => new Set(t).size === t.length, 'Each time can only be added once'),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    intervalDays: z.number().int().min(2).max(90).nullable().default(null),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.frequency === 'SPECIFIC_DAYS' && s.daysOfWeek.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['daysOfWeek'], message: 'Choose at least one day' });
    }
    if (s.frequency === 'EVERY_N_DAYS' && !s.intervalDays) {
      ctx.addIssue({ code: 'custom', path: ['intervalDays'], message: 'Choose how many days apart' });
    }
  });

// No .default() here: Zod 4 applies defaults even inside .optional(), which would make a partial
// PATCH silently overwrite fields. Defaults for create are added separately below.
const fields = {
  name: z.string().trim().min(1, 'Enter the medicine name').max(120),
  dosage: z.string().trim().min(1, 'Enter the strength, e.g. 500 mg').max(60),
  doseQuantity: z
    .number()
    .min(0.25, 'Dose must be at least 1/4')
    .max(100)
    .refine((n) => Number.isInteger(n * 4), 'Use whole, half or quarter amounts'),
  unit: z.enum(DOSE_UNITS),
  instructions: optionalText(1000),
  foodTiming: z.enum(FOOD_TIMINGS),
  foodInstructions: optionalText(500),
  /** Entered by the patient/caregiver from their prescription. Never marked "verified" through the API. */
  avoid: z.array(z.string().trim().min(1).max(200)).max(10),
  precautions: optionalText(1000),
  prescriber: optionalText(120),
  notes: optionalText(2000),
  startDate: z.iso.date(),
  endDate: z.iso.date().nullable(),
  schedule: ScheduleInput,
};

const endAfterStart = (m: { startDate?: string; endDate?: string | null }, ctx: z.RefinementCtx) => {
  if (m.startDate && m.endDate && m.endDate < m.startDate) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be after the start date' });
  }
};

export const CreateMedicationSchema = z
  .object({
    ...fields,
    instructions: fields.instructions.optional().transform((v) => v ?? null),
    foodInstructions: fields.foodInstructions.optional().transform((v) => v ?? null),
    precautions: fields.precautions.optional().transform((v) => v ?? null),
    prescriber: fields.prescriber.optional().transform((v) => v ?? null),
    notes: fields.notes.optional().transform((v) => v ?? null),
    avoid: fields.avoid.optional().transform((v) => v ?? []),
    endDate: fields.endDate.optional().transform((v) => v ?? null),
  })
  .strict()
  .superRefine(endAfterStart);

export const UpdateMedicationSchema = z
  .object({
    name: fields.name.optional(),
    dosage: fields.dosage.optional(),
    doseQuantity: fields.doseQuantity.optional(),
    unit: fields.unit.optional(),
    instructions: fields.instructions.optional(),
    foodTiming: fields.foodTiming.optional(),
    foodInstructions: fields.foodInstructions.optional(),
    avoid: fields.avoid.optional(),
    precautions: fields.precautions.optional(),
    prescriber: fields.prescriber.optional(),
    notes: fields.notes.optional(),
    startDate: fields.startDate.optional(),
    endDate: fields.endDate.optional(),
    schedule: fields.schedule.optional(),
    /** Optimistic concurrency: the version the client last saw. */
    version: z.number().int().positive(),
  })
  .strict()
  .superRefine(endAfterStart);

export type CreateMedicationInput = z.infer<typeof CreateMedicationSchema>;
export type UpdateMedicationInput = z.infer<typeof UpdateMedicationSchema>;
export type ScheduleInputT = z.infer<typeof ScheduleInput>;
