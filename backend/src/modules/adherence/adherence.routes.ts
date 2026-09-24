import { Router } from 'express';
import { z } from 'zod';
import { assertPatientAccess, resolvePatientId } from '../../lib/access.js';
import { badRequest, notFound } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { addDaysKey, dateKeyInTz, daysBetweenKeys, isValidTimeZone, zonedToUtc } from '../../lib/time.js';
import { authOf } from '../../middleware/auth.js';
import { parse } from '../../middleware/validate.js';
import { adherenceReport } from './compute.js';

const Query = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  patientId: z.uuid().optional(),
});

const MAX_DAYS = 92;
const fromDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export function adherenceRoutes(db: Db) {
  const router = Router();

  async function report(req: Express.Request & { query: unknown }, days?: number) {
    const actor = authOf(req);
    const q = parse(Query, req.query);
    const patientId = resolvePatientId(actor, q.patientId);
    await assertPatientAccess(db, actor, patientId, 'view_adherence');

    const patient = await db.user.findUnique({ where: { id: patientId }, select: { timezone: true } });
    if (!patient) throw notFound('Patient not found');
    const tz = isValidTimeZone(patient.timezone) ? patient.timezone : 'UTC';
    const now = new Date();
    const today = dateKeyInTz(now, tz);

    const to = days ? today : (q.to ?? today);
    const from = days ? addDaysKey(today, -(days - 1)) : (q.from ?? addDaysKey(to, -6));
    const span = daysBetweenKeys(from, to);
    if (span < 0 || span >= MAX_DAYS) throw badRequest(`Choose a range of 1 to ${MAX_DAYS} days`);

    const meds = await db.medication.findMany({
      where: { patientId },
      include: { schedules: true },
    });
    const logs = await db.medicationLog.findMany({
      where: {
        patientId,
        // Pad a day each side: local days map to UTC instants across midnight.
        scheduledFor: { gte: zonedToUtc(addDaysKey(from, -1), '00:00', tz), lt: zonedToUtc(addDaysKey(to, 2), '00:00', tz) },
      },
    });

    const label = days === 7 ? 'this week' : days === 30 ? 'in the last 30 days' : 'in this period';
    return adherenceReport(
      meds.map((m) => ({
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
      })),
      logs,
      tz,
      from,
      to,
      now,
      label,
    );
  }

  router.get('/', async (req, res) => {
    res.json(await report(req));
  });
  router.get('/weekly', async (req, res) => {
    res.json(await report(req, 7));
  });
  router.get('/monthly', async (req, res) => {
    res.json(await report(req, 30));
  });

  return router;
}
