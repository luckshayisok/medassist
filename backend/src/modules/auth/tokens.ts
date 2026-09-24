import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { AppConfig } from '../../config/env.js';
import type { Db } from '../../lib/prisma.js';
import { unauthorized } from '../../lib/errors.js';
import type { Role } from '../../generated/prisma/client.js';

const ISSUER = 'medassist-api';
const AUDIENCE = 'medassist-app';

export interface AccessClaims {
  sub: string;
  role: Role;
}

export function signAccessToken(config: AppConfig, claims: AccessClaims): string {
  return jwt.sign({ role: claims.role }, config.jwtAccessSecret, {
    algorithm: 'HS256',
    subject: claims.sub,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: config.accessTokenTtlSeconds,
  });
}

export function verifyAccessToken(config: AppConfig, token: string): AccessClaims {
  try {
    const payload = jwt.verify(token, config.jwtAccessSecret, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload === 'string' || !payload.sub || (payload.role !== 'PATIENT' && payload.role !== 'CAREGIVER')) {
      throw new Error('bad payload');
    }
    return { sub: payload.sub, role: payload.role };
  } catch (e) {
    if (e instanceof jwt.TokenExpiredError) throw unauthorized('Session expired', 'TOKEN_EXPIRED');
    throw unauthorized('Invalid token', 'INVALID_TOKEN');
  }
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Issue a new opaque refresh token. Only its SHA-256 hash is stored. */
export async function issueRefreshToken(db: Db, config: AppConfig, userId: string, familyId: string = randomUUID()) {
  const token = randomBytes(32).toString('base64url');
  const row = await db.refreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * 86_400_000),
    },
  });
  return { token, row };
}

/**
 * Rotate a refresh token. If a token that was already rotated is presented again, someone may
 * have stolen it: revoke the whole family so both the thief and the victim must log in again.
 */
export async function rotateRefreshToken(db: Db, config: AppConfig, presented: string) {
  const existing = await db.refreshToken.findUnique({ where: { tokenHash: hashToken(presented) } });
  if (!existing) throw unauthorized('Invalid session', 'INVALID_REFRESH');

  if (existing.revokedAt) {
    await db.refreshToken.updateMany({
      where: { familyId: existing.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw unauthorized('Session was revoked. Please sign in again.', 'REFRESH_REUSED');
  }
  if (existing.expiresAt.getTime() <= Date.now()) throw unauthorized('Session expired', 'REFRESH_EXPIRED');

  const next = await issueRefreshToken(db, config, existing.userId, existing.familyId);
  // Conditional update guards against two concurrent refreshes both succeeding.
  const { count } = await db.refreshToken.updateMany({
    where: { id: existing.id, revokedAt: null },
    data: { revokedAt: new Date(), replacedBy: next.row.id },
  });
  if (count === 0) {
    await db.refreshToken.delete({ where: { id: next.row.id } });
    throw unauthorized('Session was revoked. Please sign in again.', 'REFRESH_REUSED');
  }
  return { userId: existing.userId, refreshToken: next.token };
}

export async function revokeRefreshToken(db: Db, presented: string) {
  const existing = await db.refreshToken.findUnique({ where: { tokenHash: hashToken(presented) } });
  if (!existing) return;
  await db.refreshToken.updateMany({
    where: { familyId: existing.familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
