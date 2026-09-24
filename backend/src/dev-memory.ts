/**
 * Run the API on an in-memory Postgres (PGlite) — no database setup needed.
 * For trying the app locally only: all data is lost when the process stops.
 *   npm run dev:memory
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import { createApp } from './app.js';
import { PrismaClient } from './generated/prisma/client.js';
import { logger } from './lib/logger.js';
import { LocalDiskStorage } from './lib/storage.js';
import { GeminiClient, RequestBudget } from './lib/gemini.js';
import { OpenFdaSource } from './modules/druginfo/openfda.js';
import { DemoExtractor, GeminiExtractor } from './modules/prescriptions/extractor.js';
import { tmpdir } from 'node:os';

const pg = new PGlite();
const dir = join(import.meta.dirname, '..', 'prisma', 'migrations');
for (const m of readdirSync(dir).filter((d) => !d.endsWith('.toml')).sort()) {
  await pg.exec(readFileSync(join(dir, m, 'migration.sql'), 'utf8'));
}

const db = new PrismaClient({ adapter: new PrismaPGlite(pg) });
const devLlm = process.env.GEMINI_API_KEY ? new GeminiClient(process.env.GEMINI_API_KEY, new RequestBudget(8, 200)) : null;
const port = Number(process.env.PORT ?? 4000);
const app = createApp({
  db,
  storage: new LocalDiskStorage(join(tmpdir(), 'medassist-dev-uploads')),
  // Real Gemini if a key is set; otherwise a clearly-fake sample reader so the flow can be tried.
  extractor: devLlm ? new GeminiExtractor(devLlm) : new DemoExtractor(),
  llm: devLlm,
  labels: new OpenFdaSource(),
  config: {
    nodeEnv: 'development',
    port,
    databaseUrl: 'pglite://memory',
    jwtAccessSecret: 'dev-memory-secret-not-for-production-use-000',
    accessTokenTtlSeconds: 900,
    refreshTokenTtlDays: 30,
    corsOrigins: ['http://localhost:8081', 'http://localhost:8090'],
    storageDir: join(tmpdir(), 'medassist-dev-uploads'),
    storageDriver: 'local',
    geminiPerMinute: 8,
    geminiPerDay: 200,
    authRateLimit: 100,
  },
});

app.listen(port, '0.0.0.0', () => {
  logger.warn(`In-memory MedAssist API on :${port} — data is NOT saved. Use "npm run dev" with Postgres for real use.`);
});
