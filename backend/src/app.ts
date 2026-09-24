import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { AppConfig } from './config/env.js';
import { logger } from './lib/logger.js';
import type { Db } from './lib/prisma.js';
import type { Storage } from './lib/storage.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { adherenceRoutes } from './modules/adherence/adherence.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { doseLogsRoutes } from './modules/doseLogs/doseLogs.routes.js';
import { filesRoutes } from './modules/files/files.routes.js';
import { medicationsRoutes } from './modules/medications/medications.routes.js';
import { MedicationsService } from './modules/medications/medications.service.js';
import { meRoutes } from './modules/users/me.routes.js';

export function createApp({ db, config, storage }: { db: Db; config: AppConfig; storage: Storage }) {
  const app = express();

  app.disable('x-powered-by');
  // Behind one proxy (Render/Fly/ALB) so rate limiting sees the real client IP.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: false }));
  app.use(express.json({ limit: '100kb' }));
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req.headers['x-request-id'] as string) || randomUUID(),
      // Log method, path and status only — never bodies or query strings.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, path: req.url?.split('?')[0] }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  const v1 = express.Router();
  v1.use('/auth', authRoutes(db, config));
  const medications = new MedicationsService(db, storage, config.jwtAccessSecret);
  v1.use('/me', requireAuth(config), meRoutes(db, storage));
  v1.use('/medications', requireAuth(config), medicationsRoutes(medications));
  v1.use('/dose-logs', requireAuth(config), doseLogsRoutes(db));
  v1.use('/adherence', requireAuth(config), adherenceRoutes(db));
  // Signed-URL access for private images; no bearer token (so <Image> can load them).
  v1.use('/files', filesRoutes(storage, config));
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
