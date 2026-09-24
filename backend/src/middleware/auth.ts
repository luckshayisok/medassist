import type { RequestHandler } from 'express';
import type { AppConfig } from '../config/env.js';
import type { Role } from '../generated/prisma/client.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string; role: Role };
    }
  }
}

export function requireAuth(config: AppConfig): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    const claims = verifyAccessToken(config, header.slice('Bearer '.length).trim());
    req.auth = { userId: claims.sub, role: claims.role };
    next();
  };
}

export function requireRole(role: Role): RequestHandler {
  return (req, _res, next) => {
    if (req.auth?.role !== role) throw forbidden();
    next();
  };
}

/** Narrow `req.auth` after requireAuth has run. */
export function authOf(req: Express.Request) {
  if (!req.auth) throw unauthorized();
  return req.auth;
}
