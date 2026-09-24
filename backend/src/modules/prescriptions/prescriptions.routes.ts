import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { resolvePatientId } from '../../lib/access.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { authOf } from '../../middleware/auth.js';
import { parse } from '../../middleware/validate.js';
import { VerifySchema, type PrescriptionsService } from './prescriptions.service.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1, fields: 0 } });
const IdParam = z.object({ id: z.uuid() });

export function prescriptionsRoutes(service: PrescriptionsService) {
  const router = Router();
  // Each scan costs an AI call: keep it reasonable per client.
  const scanLimiter = rateLimit({
    windowMs: 60 * 60_000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many scans. Please try again later.' } }),
  });

  const id = (params: unknown) => {
    const r = IdParam.safeParse(params);
    if (!r.success) throw notFound('Prescription not found');
    return r.data.id;
  };

  router.get('/', async (req, res) => {
    const actor = authOf(req);
    res.json(await service.list(actor, resolvePatientId(actor, req.query.patientId)));
  });

  router.post(
    '/',
    scanLimiter,
    (req, res, next) =>
      upload.single('image')(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          return next(badRequest(err.code === 'LIMIT_FILE_SIZE' ? 'That photo is too large (max 12 MB).' : 'Could not read the upload.'));
        }
        next(err as Error | undefined);
      }),
    async (req, res) => {
      if (!req.file) throw badRequest('Choose a photo of the prescription', 'NO_FILE');
      const actor = authOf(req);
      res.status(202).json(await service.upload(actor, resolvePatientId(actor, req.query.patientId), req.file.buffer));
    },
  );

  router.get('/:id', async (req, res) => {
    res.json(await service.get(authOf(req), id(req.params)));
  });

  router.post('/:id/process', scanLimiter, async (req, res) => {
    res.status(202).json(await service.retry(authOf(req), id(req.params)));
  });

  router.patch('/:id/verify', async (req, res) => {
    res.json(await service.verify(authOf(req), id(req.params), parse(VerifySchema, req.body)));
  });

  router.delete('/:id', async (req, res) => {
    await service.remove(authOf(req), id(req.params));
    res.status(204).end();
  });

  return router;
}
