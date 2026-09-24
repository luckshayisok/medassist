import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { logger } from './lib/logger.js';
import { createPrisma } from './lib/prisma.js';
import { createStorage } from './lib/storage.js';

const config = loadConfig();
const db = createPrisma(config.databaseUrl);
const app = createApp({ db, config, storage: createStorage(config.storageDriver, config.storageDir, db) });

const server = app.listen(config.port, '0.0.0.0', () => {
  logger.info(`MedAssist API listening on :${config.port}`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close();
  await db.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
