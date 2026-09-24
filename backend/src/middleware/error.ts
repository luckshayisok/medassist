import type { ErrorRequestHandler, RequestHandler } from 'express';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
};

/** Clients get a stable code + safe message. Stack traces and internals stay server-side. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    const fields = (err as HttpError & { fields?: unknown }).fields;
    res.status(err.status).json({ error: { code: err.code, message: err.message, ...(fields ? { fields } : {}) } });
    return;
  }
  // Malformed JSON from express.json()
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'BAD_JSON', message: 'Request body is not valid JSON' } });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Request body is too large' } });
    return;
  }
  logger.error({ err: { name: err?.name, message: err?.message, stack: err?.stack }, reqId: req.id }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
};
