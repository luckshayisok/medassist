import argon2 from 'argon2';
import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { notFound, unauthorized } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import type { Storage } from '../../lib/storage.js';
import { authOf } from '../../middleware/auth.js';
import { parse } from '../../middleware/validate.js';
import { publicUser } from '../auth/auth.service.js';
import { UpdateProfileSchema } from '../auth/schemas.js';

const DeleteAccountSchema = z.object({ password: z.string().min(1).max(128) });

function toDateOnly(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function meRoutes(db: Db, storage: Storage) {
  const router = Router();

  const load = async (userId: string) => {
    const user = await db.user.findUnique({ where: { id: userId }, include: { patientProfile: true } });
    if (!user) throw notFound('Account not found');
    const p = user.patientProfile;
    return {
      user: publicUser(user),
      profile: p
        ? {
            dateOfBirth: toDateOnly(p.dateOfBirth),
            emergencyContactName: p.emergencyContactName,
            emergencyContactPhone: p.emergencyContactPhone,
            accessibilitySettings: p.accessibilitySettings,
          }
        : null,
    };
  };

  router.get('/', async (req, res) => {
    res.json(await load(authOf(req).userId));
  });

  router.patch('/profile', async (req, res) => {
    const { userId, role } = authOf(req);
    const input = parse(UpdateProfileSchema, req.body);

    await db.$transaction(async (tx) => {
      if (input.name !== undefined || input.timezone !== undefined) {
        await tx.user.update({ where: { id: userId }, data: { name: input.name, timezone: input.timezone } });
      }
      if (role !== 'PATIENT') return;

      const current = await tx.patientProfile.findUnique({ where: { userId } });
      const data: Prisma.PatientProfileUpdateInput = {
        dateOfBirth: input.dateOfBirth === undefined ? undefined : input.dateOfBirth ? new Date(input.dateOfBirth) : null,
        emergencyContactName: input.emergencyContactName,
        emergencyContactPhone: input.emergencyContactPhone,
        accessibilitySettings: input.accessibilitySettings
          ? { ...((current?.accessibilitySettings as object | null) ?? {}), ...input.accessibilitySettings }
          : undefined,
      };
      await tx.patientProfile.upsert({
        where: { userId },
        update: data,
        create: { user: { connect: { id: userId } }, ...(data as object) },
      });
    });

    res.json(await load(userId));
  });

  /** Permanent account deletion (required by Google Play). Re-confirms the password. */
  router.delete('/', async (req, res) => {
    const { userId } = authOf(req);
    const { password } = parse(DeleteAccountSchema, req.body);
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound('Account not found');
    if (!(await argon2.verify(user.passwordHash, password).catch(() => false))) {
      throw unauthorized('Password is incorrect', 'INVALID_CREDENTIALS');
    }
    // Cascades remove profile, tokens, medications, logs, prescriptions, chats and relationships.
    const images = await db.medication.findMany({ where: { patientId: userId, imageKey: { not: null } }, select: { imageKey: true } });
    await db.user.delete({ where: { id: userId } });
    // Phase 7: prescription images too.
    await Promise.all(images.map((m) => storage.delete(m.imageKey!)));
    res.status(204).end();
  });

  return router;
}
