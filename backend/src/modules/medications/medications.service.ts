import sharp from 'sharp';
import type { Medication, MedicationSchedule, Prisma } from '../../generated/prisma/client.js';
import { assertPatientAccess, type CaregiverPermission } from '../../lib/access.js';
import { conflict, HttpError, notFound } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { newImageKey, signedFileUrl, type Storage } from '../../lib/storage.js';
import type { CreateMedicationInput, ScheduleInputT, UpdateMedicationInput } from './schemas.js';

type Actor = { userId: string; role: 'PATIENT' | 'CAREGIVER' };
type MedWithSchedules = Medication & { schedules: MedicationSchedule[] };

const toDate = (s: string) => new Date(`${s}T00:00:00.000Z`);
const fromDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

const activeSchedules = { where: { archivedAt: null }, orderBy: { time: 'asc' as const } };

export class MedicationsService {
  constructor(
    private readonly db: Db,
    private readonly storage: Storage,
    private readonly signingSecret: string,
  ) {}

  serialize(m: MedWithSchedules) {
    return {
      id: m.id,
      patientId: m.patientId,
      name: m.name,
      dosage: m.dosage,
      doseQuantity: Number(m.doseQuantity),
      unit: m.unit,
      imageUrl: m.imageKey ? signedFileUrl(this.signingSecret, m.imageKey) : null,
      instructions: m.instructions,
      foodTiming: m.foodTiming,
      foodInstructions: m.foodInstructions,
      avoid: m.avoidInstructions,
      precautions: m.precautions,
      prescriber: m.prescriber,
      notes: m.notes,
      startDate: fromDate(m.startDate),
      endDate: fromDate(m.endDate),
      version: m.version,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      schedules: m.schedules
        .filter((s) => !s.archivedAt)
        .map((s) => ({
          id: s.id,
          time: s.time,
          frequency: s.frequency,
          daysOfWeek: s.daysOfWeek,
          intervalDays: s.intervalDays,
          startDate: fromDate(s.startDate),
          endDate: fromDate(s.endDate),
        })),
    };
  }

  async list(actor: Actor, patientId: string) {
    await assertPatientAccess(this.db, actor, patientId, 'view_adherence');
    const meds = await this.db.medication.findMany({
      where: { patientId, deletedAt: null },
      include: { schedules: activeSchedules },
      orderBy: { name: 'asc' },
    });
    return meds.map((m) => this.serialize(m));
  }

  /** Load a medication the actor may access. Unrelated or deleted → 404 (ids can't be probed). */
  async load(actor: Actor, id: string, permission: CaregiverPermission): Promise<MedWithSchedules> {
    const med = await this.db.medication.findFirst({
      where: { id, deletedAt: null },
      include: { schedules: activeSchedules },
    });
    if (!med) throw notFound('Medicine not found');
    await assertPatientAccess(this.db, actor, med.patientId, permission);
    return med;
  }

  async create(actor: Actor, patientId: string, input: CreateMedicationInput) {
    await assertPatientAccess(this.db, actor, patientId, 'manage_medications');
    const med = await this.db.medication.create({
      data: {
        patientId,
        name: input.name,
        dosage: input.dosage,
        doseQuantity: input.doseQuantity,
        unit: input.unit,
        instructions: input.instructions,
        foodTiming: input.foodTiming,
        foodInstructions: input.foodInstructions,
        avoidInstructions: input.avoid.map((text) => ({ text, source: { kind: 'prescription' } })),
        precautions: input.precautions,
        prescriber: input.prescriber,
        notes: input.notes,
        startDate: toDate(input.startDate),
        endDate: input.endDate ? toDate(input.endDate) : null,
        schedules: { create: scheduleRows(input.schedule, input.startDate, input.endDate) },
      },
      include: { schedules: activeSchedules },
    });
    return this.serialize(med);
  }

  async update(actor: Actor, id: string, input: UpdateMedicationInput) {
    const med = await this.load(actor, id, 'manage_medications');
    const { version, schedule, avoid, startDate, endDate, ...rest } = input;

    await this.db.$transaction(async (tx) => {
      const data: Prisma.MedicationUpdateManyMutationInput = {
        ...rest,
        ...(avoid !== undefined && { avoidInstructions: avoid.map((text) => ({ text, source: { kind: 'prescription' } })) }),
        ...(startDate !== undefined && { startDate: toDate(startDate) }),
        ...(endDate !== undefined && { endDate: endDate ? toDate(endDate) : null }),
        version: { increment: 1 },
      };
      // Only succeeds if nobody else changed the medicine since the client loaded it.
      const { count } = await tx.medication.updateMany({ where: { id, version, deletedAt: null }, data });
      if (count === 0) throw conflict('This medicine was changed on another device. Please review and try again.', 'VERSION_CONFLICT');

      const start = startDate ?? fromDate(med.startDate)!;
      const end = endDate !== undefined ? endDate : fromDate(med.endDate);
      if (schedule) {
        await syncSchedules(tx, id, med.schedules, schedule, start, end);
      } else if (startDate !== undefined || endDate !== undefined) {
        await tx.medicationSchedule.updateMany({
          where: { medicationId: id, archivedAt: null },
          data: { startDate: toDate(start), endDate: end ? toDate(end) : null },
        });
      }
    });

    return this.serialize(await this.load(actor, id, 'manage_medications'));
  }

  /** Soft delete: dose history stays for adherence reports. The photo is removed. */
  async remove(actor: Actor, id: string) {
    const med = await this.load(actor, id, 'manage_medications');
    await this.db.medication.update({
      where: { id },
      data: { deletedAt: new Date(), active: false, imageKey: null, version: { increment: 1 } },
    });
    if (med.imageKey) await this.storage.delete(med.imageKey);
  }

  async setImage(actor: Actor, id: string, upload: Buffer) {
    const med = await this.load(actor, id, 'manage_medications');
    let jpeg: Buffer;
    try {
      // Re-encoding strips EXIF (GPS, device info) and neutralises malformed/hostile files.
      jpeg = await sharp(upload, { limitInputPixels: 50_000_000 })
        .rotate()
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
    } catch {
      throw new HttpError(422, 'INVALID_IMAGE', 'That file is not a photo we can use. Please try a JPG or PNG.');
    }
    const key = newImageKey();
    await this.storage.put(key, jpeg, 'image/jpeg');
    await this.db.medication.update({ where: { id }, data: { imageKey: key, version: { increment: 1 } } });
    if (med.imageKey) await this.storage.delete(med.imageKey);
    return this.serialize(await this.load(actor, id, 'manage_medications'));
  }

  async clearImage(actor: Actor, id: string) {
    const med = await this.load(actor, id, 'manage_medications');
    if (med.imageKey) {
      await this.db.medication.update({ where: { id }, data: { imageKey: null, version: { increment: 1 } } });
      await this.storage.delete(med.imageKey);
    }
    return this.serialize(await this.load(actor, id, 'manage_medications'));
  }
}

function scheduleRows(s: ScheduleInputT, startDate: string, endDate: string | null) {
  return s.times.map((time) => ({
    time,
    frequency: s.frequency,
    daysOfWeek: s.frequency === 'SPECIFIC_DAYS' ? [...new Set(s.daysOfWeek)].sort() : [],
    intervalDays: s.frequency === 'EVERY_N_DAYS' ? s.intervalDays : null,
    startDate: toDate(startDate),
    endDate: endDate ? toDate(endDate) : null,
  }));
}

/**
 * Reconcile schedule rows with the new set of times. Unchanged times keep their row id (so their
 * dose history stays linked); removed times are archived, never deleted.
 */
async function syncSchedules(
  tx: Prisma.TransactionClient,
  medicationId: string,
  current: MedicationSchedule[],
  next: ScheduleInputT,
  startDate: string,
  endDate: string | null,
) {
  const rows = scheduleRows(next, startDate, endDate);
  const byTime = new Map(current.map((s) => [s.time, s]));
  for (const row of rows) {
    const existing = byTime.get(row.time);
    if (existing) {
      await tx.medicationSchedule.update({ where: { id: existing.id }, data: row });
      byTime.delete(row.time);
    } else {
      await tx.medicationSchedule.create({ data: { ...row, medicationId } });
    }
  }
  const removed = [...byTime.values()].map((s) => s.id);
  if (removed.length) {
    await tx.medicationSchedule.updateMany({ where: { id: { in: removed } }, data: { archivedAt: new Date() } });
  }
}
