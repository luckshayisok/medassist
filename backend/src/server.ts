import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { logger } from './lib/logger.js';
import { createPrisma } from './lib/prisma.js';
import { createStorage } from './lib/storage.js';
import { GeminiClient, RequestBudget } from './lib/gemini.js';
import { OpenFdaSource } from './modules/druginfo/openfda.js';
import { GeminiExtractor } from './modules/prescriptions/extractor.js';

const config = loadConfig();
const db = createPrisma(config.databaseUrl);
// One shared budget keeps every AI feature within the (free-tier) key's limits.
const llm = config.geminiApiKey ? new GeminiClient(config.geminiApiKey, new RequestBudget(config.geminiPerMinute, config.geminiPerDay)) : null;
if (!llm) logger.warn('GEMINI_API_KEY not set: prescription scanning and the assistant are disabled');
const app = createApp({
  db,
  config,
  storage: createStorage(config.storageDriver, config.storageDir, db),
  extractor: llm ? new GeminiExtractor(llm) : null,
  llm,
  labels: new OpenFdaSource(),
});

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
