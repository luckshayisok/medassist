import { z } from 'zod';
import { LlmError, type LlmClient } from '../../lib/gemini.js';

/** What the reader returns. Every field is "as written"; null means not present or not readable. */
export const ExtractionSchema = z.object({
  readable: z.boolean(),
  rawText: z.string(),
  prescriber: z.string().nullable(),
  date: z.string().nullable(),
  medications: z.array(
    z.object({
      name: z.string().nullable(),
      strength: z.string().nullable(),
      form: z.string().nullable(),
      dose: z.string().nullable(),
      frequency: z.string().nullable(),
      timesOfDay: z.array(z.enum(['morning', 'afternoon', 'evening', 'night'])),
      foodTiming: z.enum(['BEFORE_FOOD', 'AFTER_FOOD', 'WITH_FOOD', 'EMPTY_STOMACH']).nullable(),
      foodInstructions: z.string().nullable(),
      duration: z.string().nullable(),
      instructions: z.string().nullable(),
      sourceText: z.string(),
      confidence: z.number(),
      unclearFields: z.array(z.enum(['name', 'strength', 'form', 'dose', 'frequency', 'timesOfDay', 'foodTiming', 'duration', 'instructions'])),
    }),
  ),
  warnings: z.array(z.string()),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export interface PrescriptionExtractor {
  readonly name: string;
  extract(image: Buffer): Promise<Extraction>;
}

export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}

const MED_FIELDS = ['name', 'strength', 'form', 'dose', 'frequency', 'timesOfDay', 'foodTiming', 'duration', 'instructions'];
const nullableString = { type: ['string', 'null'] };

/** JSON Schema given to the model (structured output). foodTiming uses "NOT_STATED" instead of null. */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    readable: { type: 'boolean' },
    rawText: { type: 'string' },
    prescriber: nullableString,
    date: nullableString,
    warnings: { type: 'array', items: { type: 'string' } },
    medications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: nullableString,
          strength: nullableString,
          form: nullableString,
          dose: nullableString,
          frequency: nullableString,
          timesOfDay: { type: 'array', items: { type: 'string', enum: ['morning', 'afternoon', 'evening', 'night'] } },
          foodTiming: { type: 'string', enum: ['BEFORE_FOOD', 'AFTER_FOOD', 'WITH_FOOD', 'EMPTY_STOMACH', 'NOT_STATED'] },
          foodInstructions: nullableString,
          duration: nullableString,
          instructions: nullableString,
          sourceText: { type: 'string' },
          confidence: { type: 'number' },
          unclearFields: { type: 'array', items: { type: 'string', enum: MED_FIELDS } },
        },
        required: [...MED_FIELDS, 'foodInstructions', 'sourceText', 'confidence', 'unclearFields'],
      },
    },
  },
  required: ['readable', 'rawText', 'prescriber', 'date', 'medications', 'warnings'],
};

export const EXTRACTION_PROMPT = `You read photos of medical prescriptions for an app that helps older patients follow their existing plan. A patient or caregiver will check every field against the paper before anything is used, so your job is faithful transcription, not interpretation.

Rules:
- Transcribe only what is written. Never infer, complete, or "correct" a medicine name, strength, dose, frequency, or duration. If a word is ambiguous or illegible, set that field to null and list it in unclearFields - never guess, even if a likely medicine comes to mind.
- Expand standard prescription notation only when it is written clearly: OD = once daily, BD/BID = twice daily, TDS/TID = three times daily, QID = four times daily, HS = at bedtime, SOS/PRN = only when needed, AC = before food, PC = after food, and dose-pattern notation like "1-0-1" (morning-afternoon-night). Put the notation as written in frequency, and fill timesOfDay only when the notation states the times explicitly (e.g. "1-0-1" -> morning, night; HS -> night; "BD" alone does not state times, so leave timesOfDay empty).
- foodTiming only from explicit instructions (AC, PC, "after food", "empty stomach", ...). Otherwise NOT_STATED.
- sourceText: the exact line(s) you read for that medicine, so the patient can compare.
- confidence: 0 to 1 for how sure you are of the whole entry.
- Put anything the patient should double-check with their doctor or pharmacist in warnings (e.g. "Line 3 is partly illegible", "No duration written for Metformin"). Do not give medical advice.
- If the image is not a prescription or is unreadable, set readable to false, medications to [], and explain in warnings.`;

/** Reads prescriptions with Gemini (vision + JSON-schema output). */
export class GeminiExtractor implements PrescriptionExtractor {
  readonly name = 'gemini';

  constructor(private readonly llm: LlmClient) {}

  async extract(image: Buffer): Promise<Extraction> {
    let text: string;
    try {
      text = await this.llm.generate({
        contents: [
          {
            role: 'user',
            parts: [{ inlineData: { mimeType: 'image/jpeg', data: image.toString('base64') } }, { text: 'Read this prescription.' }],
          },
        ],
        config: {
          systemInstruction: EXTRACTION_PROMPT,
          responseMimeType: 'application/json',
          responseJsonSchema: RESPONSE_SCHEMA,
          temperature: 0,
          maxOutputTokens: 8192,
        },
      });
    } catch (e) {
      if (e instanceof LlmError) throw new ExtractionError(e.message, e.retryable);
      throw e;
    }
    return parseExtraction(text);
  }
}

/** Validate model output. Anything malformed is treated as "could not read", never partially trusted. */
export function parseExtraction(text: string): Extraction {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ExtractionError('We could not read this prescription. Please try again.', true);
  }
  if (raw && typeof raw === 'object' && Array.isArray((raw as { medications?: unknown }).medications)) {
    for (const m of (raw as { medications: Record<string, unknown>[] }).medications) {
      if (m.foodTiming === 'NOT_STATED') m.foodTiming = null;
    }
  }
  const result = ExtractionSchema.safeParse(raw);
  if (!result.success) throw new ExtractionError('We could not read this prescription. Please try again.', true);
  return result.data;
}

/**
 * Local development only (npm run dev:memory without an AI key): returns a fixed sample so the
 * scan → review → confirm flow can be exercised. Never used when a real key is configured.
 */
export class DemoExtractor implements PrescriptionExtractor {
  readonly name = 'demo';
  constructor(private readonly delayMs = 1500) {}
  async extract(): Promise<Extraction> {
    await new Promise((r) => setTimeout(r, this.delayMs));
    return {
      readable: true,
      rawText: 'Dr. A. Sharma\n1. Tab Metformin 500mg 1-0-1 PC x 30 days\n2. Tab Atorvastatin 20mg 0-0-1 HS\n3. Cap Pan?? 40 1-0-0 AC',
      prescriber: 'Dr. A. Sharma',
      date: null,
      medications: [
        { name: 'Metformin', strength: '500 mg', form: 'tablet', dose: '1 tablet', frequency: '1-0-1', timesOfDay: ['morning', 'night'], foodTiming: 'AFTER_FOOD', foodInstructions: 'After food', duration: '30 days', instructions: null, sourceText: 'Tab Metformin 500mg 1-0-1 PC x 30 days', confidence: 0.95, unclearFields: [] },
        { name: 'Atorvastatin', strength: '20 mg', form: 'tablet', dose: '1 tablet', frequency: '0-0-1 HS', timesOfDay: ['night'], foodTiming: null, foodInstructions: null, duration: null, instructions: 'At bedtime', sourceText: 'Tab Atorvastatin 20mg 0-0-1 HS', confidence: 0.9, unclearFields: [] },
        { name: null, strength: '40', form: 'capsule', dose: '1 capsule', frequency: '1-0-0', timesOfDay: ['morning'], foodTiming: 'BEFORE_FOOD', foodInstructions: 'Before food', duration: null, instructions: null, sourceText: 'Cap Pan?? 40 1-0-0 AC', confidence: 0.4, unclearFields: ['name'] },
      ],
      warnings: ['The name of the third medicine is not clearly readable.', 'No duration is written for Atorvastatin.'],
    };
  }
}
