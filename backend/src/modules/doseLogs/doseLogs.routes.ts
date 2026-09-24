import { Router } from 'express';
import { z } from 'zod';
import { resolvePatientId } from '../../lib/access.js';
import { authOf } from '../../middleware/auth.js';
import { parse } from '../../middleware/validate.js';
import type { Db } from '../../lib/prisma.js';
import { DoseLogsService, SyncSchema } from './doseLogs.service.js';

const ListQuery = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  patientId: z.uuid().optional(),
});

export function doseLogsRoutes(db: Db) {
  const service = new DoseLogsService(db);
  const router = Router();

  /** Upload the phone's offline outbox. Always 200 with a per-item result. */
  router.post('/sync', async (req, res) => {
    const actor = authOf(req);
    const { logs } = parse(SyncSchema, req.body);
    res.json({ results: await service.sync(actor, resolvePatientId(actor, req.query.patientId), logs) });
  });

  router.get('/', async (req, res) => {
    const actor = authOf(req);
    const q = parse(ListQuery, req.query);
    const from = new Date(q.from);
    const to = new Date(q.to);
    if (to <= from || to.getTime() - from.getTime() > 100 * 86_400_000) {
      res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Range must be between 0 and 100 days' } });
      return;
    }
    res.json(await service.list(actor, resolvePatientId(actor, q.patientId), from, to));
  });

  return router;
}
