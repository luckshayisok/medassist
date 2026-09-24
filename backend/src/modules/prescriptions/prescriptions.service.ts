import sharp from 'sharp';
import { z } from 'zod';
import type { Prescription, PrescriptionMedication } from '../../generated/prisma/client.js';
import { assertPatientAccess } from '../../lib/access.js';
import { badRequest, conflict, HttpError, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { Db } from '../../lib/prisma.js';
import { newImageKey, signedFileUrl, type Storage } from '../../lib/storage.js';
import type { MedicationsService } from '../medications/medications.service.js';
import { CreateMedicationSchema } from '../medications/schemas.js';
import { ExtractionError, type PrescriptionExtractor } from './extractor.js';

type Actor = { userId: string; role: 'PATIENT' | 'CAREGIVER' };
type WithMeds = Prescription & { medications: PrescriptionMedication[] };

/** A PROCESSING row older than this was interrupted (e.g. the free server went to sleep). */
const STUCK_AFTER_MS = 4 * 60_000;

export const VerifySchema = z
  .object({
    medications: z
      .array(
        z.object({
          /** The draft this came from; null for a medicine the patient added by hand on the review screen. */
          draftId: z.uuid().nullable(),
          medication: CreateMedicationSchema,
        }),
      )
      .min(1, 'Choose at least one medicine to add')
      .max(30),
    /** The patient/caregiver explicitly confirmed they checked everything against the paper. */
    confirmed: z.literal(true, { error: 'Please confirm you checked the details against your prescription' }),
  })
  .strict();

export class PrescriptionsService {
  constructor(
    private readonly db: Db,
    private readonly storage: Storage,
    private readonly medications: MedicationsService,
    private readonly extractor: PrescriptionExtractor | null,
    private readonly signingSecret: string,
  ) {}

  serialize(p: WithMeds) {
    const stuck = p.status === 'PROCESSING' && Date.now() - p.updatedAt.getTime() > STUCK_AFTER_MS;
    return {
      id: p.id,
      status: stuck ? 'FAILED' : p.status,
      errorMessage: stuck ? 'Reading was interrupted. Please try again.' : p.errorMessage,
      canRetry: stuck || p.status === 'FAILED',
      imageUrl: signedFileUrl(this.signingSecret, p.imageKey),
      prescriber: p.prescriberName,
      date: p.prescribedOn,
      warnings: p.warnings ?? [],
      rawText: p.ocrText,
      verifiedAt: p.verifiedAt,
      createdAt: p.createdAt,
      medications: p.medications.map((m) => ({
        id: m.id,
        name: m.name,
        strength: m.dosage,
        form: m.form,
        dose: m.dose,
        frequency: m.frequency,
        timesOfDay: m.timesOfDay ?? [],
        foodTiming: m.foodTiming,
        foodInstructions: m.foodInstructions,
        duration: m.duration,
        instructions: m.doctorNotes,
        sourceText: m.sourceText,
        confidence: m.confidence,
        unclearFields: m.unclearFields,
        verified: m.verified,
      })),
    };
  }

  private async load(actor: Actor, id: string, permission: 'view_adherence' | 'verify_prescriptions'): Promise<WithMeds> {
    const p = await this.db.prescription.findUnique({ where: { id }, include: { medications: { orderBy: { position: 'asc' } } } });
    if (!p) throw notFound('Prescription not found');
    await assertPatientAccess(this.db, actor, p.patientId, permission);
    return p;
  }

  async list(actor: Actor, patientId: string) {
    await assertPatientAccess(this.db, actor, patientId, 'view_adherence');
    const rows = await this.db.prescription.findMany({
      where: { patientId },
      include: { medications: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => this.serialize(r));
  }

  async get(actor: Actor, id: string) {
    return this.serialize(await this.load(actor, id, 'view_adherence'));
  }

  /** Store the photo and start reading it in the background. */
  async upload(actor: Actor, patientId: string, upload: Buffer) {
    await assertPatientAccess(this.db, actor, patientId, 'verify_prescriptions');
    let jpeg: Buffer;
    try {
      // Larger than medicine photos: small handwriting needs the resolution. EXIF is stripped.
      jpeg = await sharp(upload, { limitInputPixels: 80_000_000 })
        .rotate()
        .resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
    } catch {
      throw new HttpError(422, 'INVALID_IMAGE', 'That file is not a photo we can use. Please try a JPG or PNG.');
    }
    const key = newImageKey();
    await this.storage.put(key, jpeg, 'image/jpeg');
    const p = await this.db.prescription.create({ data: { patientId, imageKey: key, status: 'UPLOADED' }, include: { medications: true } });
    this.startProcessing(p.id, jpeg);
    return this.serialize(p);
  }

  async retry(actor: Actor, id: string) {
    const p = await this.load(actor, id, 'verify_prescriptions');
    const view = this.serialize(p);
    if (!view.canRetry) throw conflict('This prescription is not waiting for a retry', 'NOT_RETRYABLE');
    const image = await this.storage.get(p.imageKey);
    if (!image) throw notFound('The photo for this prescription is missing. Please scan it again.');
    await this.db.prescription.update({ where: { id }, data: { status: 'UPLOADED', errorMessage: null } });
    this.startProcessing(id, image);
    return this.get(actor, id);
  }

  /** Fire-and-forget; progress is visible through status polling. Exposed for tests. */
  startProcessing(id: string, image: Buffer): Promise<void> {
    const run = this.process(id, image).catch((e) => logger.error({ err: { message: (e as Error).message }, prescriptionId: id }, 'prescription processing crashed'));
    return run;
  }

  async process(id: string, image: Buffer): Promise<void> {
    if (!this.extractor) {
      await this.db.prescription.update({
        where: { id },
        data: { status: 'FAILED', errorMessage: 'Prescription reading is not set up on the server yet. You can add the medicines yourself.' },
      });
      return;
    }
    await this.db.prescription.update({ where: { id }, data: { status: 'PROCESSING', errorMessage: null } });
    try {
      const result = await this.extractor.extract(image);
      const meds = result.readable ? result.medications : [];
      await this.db.$transaction(async (tx) => {
        await tx.prescriptionMedication.deleteMany({ where: { prescriptionId: id } });
        for (const [position, m] of meds.entries()) {
          await tx.prescriptionMedication.create({
            data: {
              prescriptionId: id,
              position,
              name: clip(m.name, 120),
              dosage: clip(m.strength, 60),
              form: clip(m.form, 40),
              dose: clip(m.dose, 60),
              frequency: clip(m.frequency, 120),
              timesOfDay: m.timesOfDay,
              foodTiming: m.foodTiming,
              foodInstructions: clip(m.foodInstructions, 500),
              duration: clip(m.duration, 120),
              doctorNotes: clip(m.instructions, 1000),
              sourceText: clip(m.sourceText, 1000),
              confidence: Math.max(0, Math.min(1, m.confidence)),
              unclearFields: m.unclearFields,
            },
          });
        }
        await tx.prescription.update({
          where: { id },
          data: meds.length
            ? {
                status: 'NEEDS_REVIEW',
                ocrText: result.rawText.slice(0, 20_000),
                prescriberName: clip(result.prescriber, 120),
                prescribedOn: clip(result.date, 40),
                warnings: result.warnings.slice(0, 20).map((w) => w.slice(0, 300)),
              }
            : {
                status: 'FAILED',
                ocrText: result.rawText.slice(0, 20_000),
                warnings: result.warnings.slice(0, 20).map((w) => w.slice(0, 300)),
                errorMessage: "We couldn't find any medicines we could read clearly. Try a sharper photo in good light, or add the medicines yourself.",
              },
        });
      });
    } catch (e) {
      const message = e instanceof ExtractionError ? e.message : 'We could not read this prescription. Please try again.';
      await this.db.prescription.update({ where: { id }, data: { status: 'FAILED', errorMessage: message } });
      if (!(e instanceof ExtractionError)) throw e;
    }
  }

  /**
   * The patient/caregiver has checked (and usually edited) each medicine. Only now are real
   * medicines created — extracted data is never activated on its own.
   */
  async verify(actor: Actor, id: string, input: z.infer<typeof VerifySchema>) {
    const p = await this.load(actor, id, 'verify_prescriptions');
    if (p.status !== 'NEEDS_REVIEW') throw conflict('This prescription is not waiting for review', 'NOT_REVIEWABLE');
    const draftIds = new Set(p.medications.map((m) => m.id));
    for (const m of input.medications) {
      if (m.draftId && !draftIds.has(m.draftId)) throw badRequest('That medicine is not part of this prescription');
    }

    const created = [];
    for (const m of input.medications) {
      const med = await this.medications.create(actor, p.patientId, {
        ...m.medication,
        prescriber: m.medication.prescriber ?? p.prescriberName,
      });
      if (m.draftId) {
        await this.db.medication.update({ where: { id: med.id }, data: { prescriptionMedId: m.draftId } });
        await this.db.prescriptionMedication.update({ where: { id: m.draftId }, data: { verified: true } });
      }
      created.push(med);
    }
    await this.db.prescription.update({
      where: { id },
      data: { status: 'VERIFIED', verifiedById: actor.userId, verifiedAt: new Date() },
    });
    return { prescription: await this.get(actor, id), medications: created };
  }

  async remove(actor: Actor, id: string) {
    const p = await this.load(actor, id, 'verify_prescriptions');
    // Medicines already created from it stay; the photo and the drafts are removed.
    await this.db.medication.updateMany({ where: { prescriptionMedId: { in: p.medications.map((m) => m.id) } }, data: { prescriptionMedId: null } });
    await this.db.prescription.delete({ where: { id } });
    await this.storage.delete(p.imageKey);
  }
}

function clip(s: string | null, max: number) {
  if (!s) return null;
  const t = s.trim();
  return t ? t.slice(0, max) : null;
}
