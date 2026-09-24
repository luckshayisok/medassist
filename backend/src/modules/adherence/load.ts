import { notFound } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { addDaysKey, dateKeyInTz, isValidTimeZone, zonedToUtc } from '../../lib/time.js';
import { expandDoses, type Dose, type LogIn, type MedicationIn } from './compute.js';

const fromDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export interface PatientDoses {
  tz: string;
  today: string;
  meds: MedicationIn[];
  logs: LogIn[];
  doses: Dose[];
}

/**
 * The patient's plan and dose outcomes between two local dates (inclusive), in their timezone.
 * Shared by adherence reports, the caregiver dashboard and missed-dose alerts. No access check:
 * callers must have already called assertPatientAccess.
 */
export async function loadPatientDoses(db: Db, patientId: string, range: { from?: string; to?: string; days?: number } = {}, now = new Date()): Promise<PatientDoses & { from: string; to: string }> {
  const patient = await db.user.findUnique({ where: { id: patientId }, select: { timezone: true } });
  if (!patient) throw notFound('Patient not found');
  const tz = isValidTimeZone(patient.timezone) ? patient.timezone : 'UTC';
  const today = dateKeyInTz(now, tz);
  const to = range.days ? today : (range.to ?? today);
  const from = range.days ? addDaysKey(today, -(range.days - 1)) : (range.from ?? addDaysKey(to, -6));

  const rows = await db.medication.findMany({ where: { patientId }, include: { schedules: true } });
  const logs = await db.medicationLog.findMany({
    where: {
      patientId,
      // Pad a day each side: local days map to UTC instants across midnight.
      scheduledFor: { gte: zonedToUtc(addDaysKey(from, -1), '00:00', tz), lt: zonedToUtc(addDaysKey(to, 2), '00:00', tz) },
    },
  });
  const meds: MedicationIn[] = rows.map((m) => ({
    id: m.id,
    name: m.name,
    dosage: m.dosage,
    createdAt: m.createdAt,
    deletedAt: m.deletedAt,
    schedules: m.schedules.map((s) => ({
      id: s.id,
      time: s.time,
      frequency: s.frequency,
      daysOfWeek: s.daysOfWeek,
      intervalDays: s.intervalDays,
      startDate: fromDate(s.startDate)!,
      endDate: fromDate(s.endDate),
      archivedAt: s.archivedAt,
    })),
  }));
  return { tz, today, from, to, meds, logs, doses: expandDoses(meds, logs, tz, from, to, now) };
}
