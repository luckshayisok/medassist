import argon2 from 'argon2';
import type { AppConfig } from '../../config/env.js';
import type { User } from '../../generated/prisma/client.js';
import { conflict, unauthorized } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import type { z } from 'zod';
import type { LoginSchema, RegisterSchema } from './schemas.js';
import { issueRefreshToken, revokeRefreshToken, rotateRefreshToken, signAccessToken } from './tokens.js';

// OWASP-recommended argon2id parameters (19 MiB, 2 iterations).
const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

// Verified against when the email is unknown so response time doesn't reveal which emails exist.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= argon2.hash('not-a-real-password', ARGON_OPTS));

export function publicUser(u: User) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, timezone: u.timezone, createdAt: u.createdAt };
}

export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly config: AppConfig,
  ) {}

  private async session(user: User) {
    const { token: refreshToken } = await issueRefreshToken(this.db, this.config, user.id);
    return {
      user: publicUser(user),
      accessToken: signAccessToken(this.config, { sub: user.id, role: user.role }),
      refreshToken,
      expiresIn: this.config.accessTokenTtlSeconds,
    };
  }

  async register(input: z.infer<typeof RegisterSchema>) {
    const existing = await this.db.user.findUnique({ where: { email: input.email } });
    if (existing) throw conflict('An account with this email already exists', 'EMAIL_TAKEN');

    const passwordHash = await argon2.hash(input.password, ARGON_OPTS);
    try {
      const user = await this.db.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          role: input.role,
          timezone: input.timezone,
          // Every patient gets a profile row up front; caregivers don't need one.
          ...(input.role === 'PATIENT' ? { patientProfile: { create: {} } } : {}),
        },
      });
      return this.session(user);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw conflict('An account with this email already exists', 'EMAIL_TAKEN');
      throw e;
    }
  }

  async login(input: z.infer<typeof LoginSchema>) {
    const user = await this.db.user.findUnique({ where: { email: input.email } });
    if (!user) {
      await argon2.verify(await getDummyHash(), input.password).catch(() => false);
      throw unauthorized('Email or password is incorrect', 'INVALID_CREDENTIALS');
    }
    const ok = await argon2.verify(user.passwordHash, input.password).catch(() => false);
    if (!ok) throw unauthorized('Email or password is incorrect', 'INVALID_CREDENTIALS');

    if (argon2.needsRehash(user.passwordHash, ARGON_OPTS)) {
      await this.db.user.update({ where: { id: user.id }, data: { passwordHash: await argon2.hash(input.password, ARGON_OPTS) } });
    }
    return this.session(user);
  }

  async refresh(refreshToken: string) {
    const rotated = await rotateRefreshToken(this.db, this.config, refreshToken);
    const user = await this.db.user.findUnique({ where: { id: rotated.userId } });
    if (!user) throw unauthorized('Invalid session', 'INVALID_REFRESH');
    return {
      user: publicUser(user),
      accessToken: signAccessToken(this.config, { sub: user.id, role: user.role }),
      refreshToken: rotated.refreshToken,
      expiresIn: this.config.accessTokenTtlSeconds,
    };
  }

  logout(refreshToken: string) {
    return revokeRefreshToken(this.db, refreshToken);
  }
}
