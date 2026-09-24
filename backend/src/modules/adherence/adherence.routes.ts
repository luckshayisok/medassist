import { Router } from 'express';
import { z } from 'zod';
import { assertPatientAccess, resolvePatientId } from '../../lib/access.js';
import { badRequest } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { daysBetweenKeys } from '../../lib/time.js';
import { authOf } from '../../middleware/auth.js';
import { parse } from '../../middleware/validate.js';
import { adherenceReport } from './compute.js';
import { loadPatientDoses } from './load.js';

const Query = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  patientId: z.uuid().optional(),
});

const MAX_DAYS = 92;

export function adherenceRoutes(db: Db) {
  const router = Router();

  async function report(req: Express.Request & { query: unknown }, days?: number) {
    const actor = authOf(req);
    const q = parse(Query, req.query);
    const patientId = resolvePatientId(actor, q.patientId);
    await assertPatientAccess(db, actor, patientId, 'view_adherence');

    if (!days && q.from && q.to) {
      const span = daysBetweenKeys(q.from, q.to);
      if (span < 0 || span >= MAX_DAYS) throw badRequest(`Choose a range of 1 to ${MAX_DAYS} days`);
    }
    const now = new Date();
    const { meds, logs, tz, from, to } = await loadPatientDoses(db, patientId, { from: q.from, to: q.to, days }, now);
    const span = daysBetweenKeys(from, to);
    if (span < 0 || span >= MAX_DAYS) throw badRequest(`Choose a range of 1 to ${MAX_DAYS} days`);

    const label = days === 7 ? 'this week' : days === 30 ? 'in the last 30 days' : 'in this period';
    return adherenceReport(meds, logs, tz, from, to, now, label);
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
