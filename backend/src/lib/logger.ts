import { pino } from 'pino';

/**
 * Health data must never reach logs. Redact auth material and any request/response bodies.
 * Log ids and status codes only.
 */
export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body',
      'res.body',
      '*.password',
      '*.passwordHash',
      '*.refreshToken',
      '*.accessToken',
      '*.email',
    ],
    censor: '[redacted]',
  },
});
