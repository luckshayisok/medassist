import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGINS: z.string().default(''),
  /** Local folder for private uploads (dev). Swap for S3/R2 in production. */
  STORAGE_DIR: z.string().default('./uploads'),
  /** 'db' keeps photos in Postgres — use on hosts without a persistent disk (Render free). */
  STORAGE_DRIVER: z.enum(['local', 'db']).default('local'),
  /** Enables prescription reading and the assistant (Gemini). Without it both fail politely. */
  GEMINI_API_KEY: z.string().min(1).optional(),
  /** Server-wide AI call budget — defaults sized for a free-tier key. */
  GEMINI_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(8),
  GEMINI_REQUESTS_PER_DAY: z.coerce.number().int().positive().default(200),
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  jwtAccessSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  corsOrigins: string[];
  storageDir: string;
  storageDriver: 'local' | 'db';
  geminiApiKey?: string;
  geminiPerMinute: number;
  geminiPerDay: number;
  /** Requests per window on /auth routes, per IP. */
  authRateLimit: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const e = parsed.data;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwtAccessSecret: e.JWT_ACCESS_SECRET,
    accessTokenTtlSeconds: e.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlDays: e.REFRESH_TOKEN_TTL_DAYS,
    corsOrigins: e.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    storageDir: e.STORAGE_DIR,
    storageDriver: e.STORAGE_DRIVER,
    geminiApiKey: e.GEMINI_API_KEY,
    geminiPerMinute: e.GEMINI_REQUESTS_PER_MINUTE,
    geminiPerDay: e.GEMINI_REQUESTS_PER_DAY,
    authRateLimit: 20,
  };
}
