import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AppConfig } from '../../config/env.js';
import type { Db } from '../../lib/prisma.js';
import { parse } from '../../middleware/validate.js';
import { AuthService } from './auth.service.js';
import { LoginSchema, RefreshSchema, RegisterSchema } from './schemas.js';

export function authRoutes(db: Db, config: AppConfig) {
  const service = new AuthService(db, config);
  const router = Router();

  // Brute-force protection on credential endpoints.
  const limiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: config.authRateLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a few minutes and try again.' } }),
  });

  router.post('/register', limiter, async (req, res) => {
    res.status(201).json(await service.register(parse(RegisterSchema, req.body)));
  });

  router.post('/login', limiter, async (req, res) => {
    res.json(await service.login(parse(LoginSchema, req.body)));
  });

  router.post('/refresh', limiter, async (req, res) => {
    res.json(await service.refresh(parse(RefreshSchema, req.body).refreshToken));
  });

  router.post('/logout', async (req, res) => {
    await service.logout(parse(RefreshSchema, req.body).refreshToken);
    res.status(204).end();
  });

  return router;
}
