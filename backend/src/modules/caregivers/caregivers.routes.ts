import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { notFound } from '../../lib/errors.js';
import { authOf } from '../../middleware/auth.js';
import { parse } from '../../middleware/validate.js';
import { AcceptSchema, PermissionsSchema, SeenSchema, type CaregiversService } from './caregivers.service.js';

const Id = z.object({ id: z.uuid() });

export function caregiversRoutes(service: CaregiversService) {
  const router = Router();

  const id = (params: unknown) => {
    const r = Id.safeParse(params);
    if (!r.success) throw notFound('Not found');
    return r.data.id;
  };

  // Patient: people who help me.
  router.get('/', async (req, res) => {
    res.json(await service.listCaregivers(authOf(req)));
  });
  router.post('/invite', async (req, res) => {
    res.status(201).json(await service.createInvite(authOf(req), parse(PermissionsSchema, req.body ?? {}).permissions));
  });
  router.delete('/invite', async (req, res) => {
    await service.cancelInvite(authOf(req));
    res.status(204).end();
  });
  router.patch('/:id', async (req, res) => {
    res.json(await service.updatePermissions(authOf(req), id(req.params), parse(PermissionsSchema, req.body).permissions));
  });
  router.delete('/:id', async (req, res) => {
    await service.removeCaregiver(authOf(req), id(req.params));
    res.status(204).end();
  });

  return router;
}

/** Caregiver: people I look after. Mounted at /care. */
export function careRoutes(service: CaregiversService, acceptPerHour = 10) {
  const router = Router();
  // Codes are short, so guessing is throttled hard.
  const acceptLimiter = rateLimit({ windowMs: 60 * 60_000, limit: acceptPerHour, standardHeaders: 'draft-8', legacyHeaders: false });
  const id = (params: unknown) => {
    const r = Id.safeParse(params);
    if (!r.success) throw notFound('Patient not found');
    return r.data.id;
  };

  router.post('/accept', acceptLimiter, async (req, res) => {
    res.status(201).json(await service.accept(authOf(req), parse(AcceptSchema, req.body).code));
  });
  router.get('/patients', async (req, res) => {
    res.json(await service.listPatients(authOf(req)));
  });
  router.get('/patients/:id', async (req, res) => {
    res.json(await service.patientToday(authOf(req), id(req.params)));
  });
  router.delete('/patients/:id', async (req, res) => {
    await service.leave(authOf(req), id(req.params));
    res.status(204).end();
  });
  router.get('/alerts', async (req, res) => {
    res.json(await service.alerts(authOf(req)));
  });
  router.post('/alerts/seen', async (req, res) => {
    await service.markSeen(authOf(req), parse(SeenSchema, req.body).ids);
    res.status(204).end();
  });

  return router;
}
