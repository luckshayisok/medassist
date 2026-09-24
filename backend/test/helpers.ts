import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { AppConfig } from '../src/config/env.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { LocalDiskStorage } from '../src/lib/storage.js';
import type { PrescriptionExtractor } from '../src/modules/prescriptions/extractor.js';
import type { LlmClient } from '../src/lib/gemini.js';
import type { LabelSource } from '../src/modules/druginfo/openfda.js';

export const testConfig: AppConfig = {
  nodeEnv: 'test',
  port: 0,
  databaseUrl: 'pglite://memory',
  jwtAccessSecret: 'test-secret-that-is-definitely-longer-than-32-chars',
  accessTokenTtlSeconds: 900,
  refreshTokenTtlDays: 30,
  corsOrigins: [],
  storageDir: '',
  storageDriver: 'local',
  geminiPerMinute: 8,
  geminiPerDay: 200,
  authRateLimit: 1000,
};

/** A fresh in-memory Postgres with every migration applied — the same SQL production runs. */
export async function createTestDb() {
  const pg = new PGlite();
  const dir = join(import.meta.dirname, '..', 'prisma', 'migrations');
  for (const m of readdirSync(dir).filter((d) => !d.endsWith('.toml')).sort()) {
    await pg.exec(readFileSync(join(dir, m, 'migration.sql'), 'utf8'));
  }
  const db = new PrismaClient({ adapter: new PrismaPGlite(pg) });
  return {
    db,
    async reset() {
      await pg.exec('TRUNCATE "User" CASCADE;');
    },
    async close() {
      await db.$disconnect();
      await pg.close();
    },
  };
}

export function makeApi(db: PrismaClient, config: Partial<AppConfig> = {}, extractor: PrescriptionExtractor | null = null, llm: LlmClient | null = null, labels: LabelSource | null = null) {
  const storageDir = mkdtempSync(join(tmpdir(), 'medassist-test-'));
  const storage = new LocalDiskStorage(storageDir);
  const agent = request(createApp({ db, config: { ...testConfig, storageDir, ...config }, storage, extractor, llm, labels }));
  return Object.assign(agent, { storage, storageDir });
}

export const patientInput = {
  name: 'Ravi Kumar',
  email: 'ravi@example.com',
  password: 'correct horse battery',
  role: 'PATIENT' as 'PATIENT' | 'CAREGIVER',
  timezone: 'Asia/Kolkata',
};

/** Register a user and return an Authorization header for them. */
export async function signUp(api: ReturnType<typeof makeApi>, overrides: Partial<typeof patientInput> = {}) {
  const res = await api.post('/api/v1/auth/register').send({ ...patientInput, ...overrides });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { user: res.body.user as { id: string }, auth: { Authorization: `Bearer ${res.body.accessToken}` } };
}
