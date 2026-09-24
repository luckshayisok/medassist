import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { resolvePatientId } from '../../lib/access.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { authOf } from '../../middleware/auth.js';
import { parse } from '../../middleware/validate.js';
import type { MedicationsService } from './medications.service.js';
import { CreateMedicationSchema, UpdateMedicationSchema } from './schemas.js';

const IdParam = z.object({ id: z.uuid('Medicine not found') });
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 },
});

export function medicationsRoutes(service: MedicationsService) {
  const router = Router();
  const uploadLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });

  const id = (params: unknown) => {
    const r = IdParam.safeParse(params);
    // A malformed id is just "not found" — don't reveal validation details for ids.
    if (!r.success) throw notFound('Medicine not found');
    return r.data.id;
  };

  router.get('/', async (req, res) => {
    const actor = authOf(req);
    res.json(await service.list(actor, resolvePatientId(actor, req.query.patientId)));
  });

  router.post('/', async (req, res) => {
    const actor = authOf(req);
    const input = parse(CreateMedicationSchema, req.body);
    res.status(201).json(await service.create(actor, resolvePatientId(actor, req.query.patientId), input));
  });

  router.get('/:id', async (req, res) => {
    res.json(service.serialize(await service.load(authOf(req), id(req.params), 'view_adherence')));
  });

  router.patch('/:id', async (req, res) => {
    res.json(await service.update(authOf(req), id(req.params), parse(UpdateMedicationSchema, req.body)));
  });

  router.delete('/:id', async (req, res) => {
    await service.remove(authOf(req), id(req.params));
    res.status(204).end();
  });

  router.post('/:id/image', uploadLimiter, (req, res, next) => {
    upload.single('image')(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError) {
        const tooBig = err.code === 'LIMIT_FILE_SIZE';
        return next(badRequest(tooBig ? 'That photo is too large (max 8 MB).' : 'Could not read the upload.', tooBig ? 'FILE_TOO_LARGE' : 'BAD_UPLOAD'));
      }
      next(err as Error | undefined);
    });
  }, async (req, res) => {
    if (!req.file) throw badRequest('Choose a photo to upload', 'NO_FILE');
    res.json(await service.setImage(authOf(req), id(req.params), req.file.buffer));
  });

  router.delete('/:id/image', async (req, res) => {
    res.json(await service.clearImage(authOf(req), id(req.params)));
  });

  return router;
}
