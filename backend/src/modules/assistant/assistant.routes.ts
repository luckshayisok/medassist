import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { resolvePatientId } from '../../lib/access.js';
import { authOf } from '../../middleware/auth.js';
import { parse } from '../../middleware/validate.js';
import { ChatSchema, type AssistantService } from './assistant.service.js';

const HistoryQuery = z.object({ conversationId: z.uuid().optional(), patientId: z.uuid().optional() });

export function assistantRoutes(service: AssistantService) {
  const router = Router();
  // Per person (not per IP): a free-tier AI key is shared by everyone.
  const chatLimiter = rateLimit({
    windowMs: 60 * 60_000,
    limit: 30,
    keyGenerator: (req) => req.auth?.userId ?? 'anon',
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: "You've asked a lot of questions this hour. Please try again a bit later." } }),
  });

  router.post('/chat', chatLimiter, async (req, res) => {
    const actor = authOf(req);
    res.json(await service.chat(actor, resolvePatientId(actor, req.query.patientId), parse(ChatSchema, req.body)));
  });

  router.get('/history', async (req, res) => {
    const actor = authOf(req);
    const q = parse(HistoryQuery, req.query);
    res.json(await service.history(actor, resolvePatientId(actor, q.patientId), q.conversationId));
  });

  router.delete('/history', async (req, res) => {
    const actor = authOf(req);
    await service.clear(actor, resolvePatientId(actor, req.query.patientId));
    res.status(204).end();
  });

  return router;
}
