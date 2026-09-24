import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { AppConfig } from './config/env.js';
import { logger } from './lib/logger.js';
import type { LlmClient } from './lib/gemini.js';
import type { Db } from './lib/prisma.js';
import type { Storage } from './lib/storage.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { adherenceRoutes } from './modules/adherence/adherence.routes.js';
import { assistantRoutes } from './modules/assistant/assistant.routes.js';
import { AssistantService } from './modules/assistant/assistant.service.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { doseLogsRoutes } from './modules/doseLogs/doseLogs.routes.js';
import { filesRoutes } from './modules/files/files.routes.js';
import { medicationsRoutes } from './modules/medications/medications.routes.js';
import { MedicationsService } from './modules/medications/medications.service.js';
import { careRoutes, caregiversRoutes } from './modules/caregivers/caregivers.routes.js';
import { CaregiversService } from './modules/caregivers/caregivers.service.js';
import { DrugInfoService } from './modules/druginfo/druginfo.service.js';
import type { LabelSource } from './modules/druginfo/openfda.js';
import type { PrescriptionExtractor } from './modules/prescriptions/extractor.js';
import { prescriptionsRoutes } from './modules/prescriptions/prescriptions.routes.js';
import { PrescriptionsService } from './modules/prescriptions/prescriptions.service.js';
import { meRoutes } from './modules/users/me.routes.js';

export function createApp({
  db,
  config,
  storage,
  extractor = null,
  llm = null,
  labels = null,
}: {
  db: Db;
  config: AppConfig;
  storage: Storage;
  extractor?: PrescriptionExtractor | null;
  llm?: LlmClient | null;
  /** Official label source for verified facts (openFDA in production; a stub in tests). */
  labels?: LabelSource | null;
}) {
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
  app.get('/', (_req, res) => {
    res.json({ service: 'MedAssist API', status: 'ok', health: '/health', api: '/api/v1' });
  });

  const v1 = express.Router();
  v1.use('/auth', authRoutes(db, config));
  const medications = new MedicationsService(db, storage, config.jwtAccessSecret);
  v1.use('/me', requireAuth(config), meRoutes(db, storage));
  v1.use('/medications', requireAuth(config), medicationsRoutes(medications));
  v1.use('/dose-logs', requireAuth(config), doseLogsRoutes(db));
  v1.use('/adherence', requireAuth(config), adherenceRoutes(db));
  v1.use(
    '/prescriptions',
    requireAuth(config),
    prescriptionsRoutes(new PrescriptionsService(db, storage, medications, extractor, config.jwtAccessSecret)),
  );
  const caregivers = new CaregiversService(db);
  v1.use('/caregivers', requireAuth(config), caregiversRoutes(caregivers));
  v1.use('/care', requireAuth(config), careRoutes(caregivers, config.nodeEnv === 'test' ? 1000 : 10));
  v1.use('/assistant', requireAuth(config), assistantRoutes(new AssistantService(db, llm, '112', new DrugInfoService(db, labels))));
  // Signed-URL access for private images; no bearer token (so <Image> can load them).
  v1.use('/files', filesRoutes(storage, config));
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
