import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { assertPatientAccess, type CaregiverPermission } from '../../lib/access.js';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { tally, type Dose } from '../adherence/compute.js';
import { loadPatientDoses } from '../adherence/load.js';

type Actor = { userId: string; role: 'PATIENT' | 'CAREGIVER' };

/** What a patient may grant. Seeing medicines and progress is always included. */
export const GRANTABLE = ['manage_medications', 'receive_alerts'] as const;
export const PermissionsSchema = z.object({ permissions: z.array(z.enum(GRANTABLE)).max(GRANTABLE.length).default([]) }).strict();
export const AcceptSchema = z.object({ code: z.string().trim().min(4).max(20) }).strict();
export const SeenSchema = z.object({ ids: z.array(z.uuid()).min(1).max(200) }).strict();

const INVITE_TTL_MS = 48 * 3600_000;
/** Missed doses older than this when first noticed are not alerted (no surprise backlog). */
const ALERT_LOOKBACK_MS = 24 * 3600_000;
// No 0/O, 1/I/L: easy to read aloud over the phone.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function newInviteCode(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}
/** "abcd-2345", "ABCD 2345" → "ABCD2345". */
export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
const formatCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;

function toPermissions(granted: readonly string[]): CaregiverPermission[] {
  const p = new Set<CaregiverPermission>(['view_adherence']);
  for (const g of granted) {
    if (g === 'manage_medications') {
      p.add('manage_medications');
      p.add('verify_prescriptions');
    }
    if (g === 'receive_alerts') p.add('receive_alerts');
  }
  return [...p];
}

export class CaregiversService {
  constructor(private readonly db: Db) {}

  // ─── Patient side ──────────────────────────────────────────────────────────

  private requirePatient(actor: Actor) {
    if (actor.role !== 'PATIENT') throw forbidden('Only the patient can do this');
  }

  async createInvite(actor: Actor, granted: readonly string[]) {
    this.requirePatient(actor);
    // One live code at a time: a new code replaces any unused one.
    await this.db.caregiverInvite.deleteMany({ where: { patientId: actor.userId, usedAt: null } });
    let code = newInviteCode();
    while (await this.db.caregiverInvite.findUnique({ where: { code } })) code = newInviteCode();
    const invite = await this.db.caregiverInvite.create({
      data: { code, patientId: actor.userId, permissions: toPermissions(granted), expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
    });
    return { code: formatCode(invite.code), expiresAt: invite.expiresAt, permissions: invite.permissions };
  }

  async cancelInvite(actor: Actor) {
    this.requirePatient(actor);
    await this.db.caregiverInvite.deleteMany({ where: { patientId: actor.userId, usedAt: null } });
  }

  async listCaregivers(actor: Actor) {
    this.requirePatient(actor);
    const [rels, invite] = await Promise.all([
      this.db.caregiverRelationship.findMany({
        where: { patientId: actor.userId, status: 'ACTIVE' },
        include: { caregiver: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.db.caregiverInvite.findFirst({ where: { patientId: actor.userId, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } }),
    ]);
    return {
      caregivers: rels.map((r) => ({ id: r.id, name: r.caregiver.name, email: r.caregiver.email, permissions: r.permissions, since: r.createdAt })),
      invite: invite ? { code: formatCode(invite.code), expiresAt: invite.expiresAt, permissions: invite.permissions } : null,
    };
  }

  private async ownRelationship(actor: Actor, id: string) {
    this.requirePatient(actor);
    const rel = await this.db.caregiverRelationship.findUnique({ where: { id } });
    if (!rel || rel.patientId !== actor.userId || rel.status !== 'ACTIVE') throw notFound('Caregiver not found');
    return rel;
  }

  async updatePermissions(actor: Actor, id: string, granted: readonly string[]) {
    await this.ownRelationship(actor, id);
    const rel = await this.db.caregiverRelationship.update({ where: { id }, data: { permissions: toPermissions(granted) } });
    return { id: rel.id, permissions: rel.permissions };
  }

  async removeCaregiver(actor: Actor, id: string) {
    const rel = await this.ownRelationship(actor, id);
    await this.end(rel.caregiverId, rel.patientId);
  }

  private async end(caregiverId: string, patientId: string) {
    await this.db.$transaction([
      this.db.caregiverRelationship.update({ where: { caregiverId_patientId: { caregiverId, patientId } }, data: { status: 'REVOKED', permissions: [] } }),
      this.db.caregiverAlert.deleteMany({ where: { caregiverId, patientId } }),
    ]);
  }

  // ─── Caregiver side ────────────────────────────────────────────────────────

  private requireCaregiver(actor: Actor) {
    if (actor.role !== 'CAREGIVER') throw forbidden('Only a caregiver account can do this');
  }

  async accept(actor: Actor, rawCode: string) {
    this.requireCaregiver(actor);
    const code = normalizeCode(rawCode);
    const invite = await this.db.caregiverInvite.findUnique({ where: { code }, include: { patient: { select: { id: true, name: true } } } });
    if (!invite || invite.usedAt || invite.expiresAt <= new Date()) {
      throw badRequest('This code is not valid or has expired. Ask for a new code.', 'INVALID_CODE');
    }
    const existing = await this.db.caregiverRelationship.findUnique({
      where: { caregiverId_patientId: { caregiverId: actor.userId, patientId: invite.patientId } },
    });
    if (existing?.status === 'ACTIVE') throw conflict(`You are already linked with ${invite.patient.name}.`, 'ALREADY_LINKED');

    await this.db.$transaction([
      this.db.caregiverRelationship.upsert({
        where: { caregiverId_patientId: { caregiverId: actor.userId, patientId: invite.patientId } },
        create: { caregiverId: actor.userId, patientId: invite.patientId, status: 'ACTIVE', permissions: invite.permissions },
        // Re-linking starts fresh (and alerts only cover doses from now on).
        update: { status: 'ACTIVE', permissions: invite.permissions, createdAt: new Date() },
      }),
      this.db.caregiverInvite.update({ where: { code }, data: { usedAt: new Date() } }),
    ]);
    return { patient: { id: invite.patient.id, name: invite.patient.name }, permissions: invite.permissions };
  }

  async leave(actor: Actor, patientId: string) {
    this.requireCaregiver(actor);
    const rel = await this.db.caregiverRelationship.findUnique({ where: { caregiverId_patientId: { caregiverId: actor.userId, patientId } } });
    if (!rel || rel.status !== 'ACTIVE') throw notFound('Patient not found');
    await this.end(actor.userId, patientId);
  }

  /** Everyone this caregiver looks after, with how today is going. */
  async listPatients(actor: Actor, now = new Date()) {
    this.requireCaregiver(actor);
    const rels = await this.db.caregiverRelationship.findMany({
      where: { caregiverId: actor.userId, status: 'ACTIVE' },
      include: { patient: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(
      rels.map(async (r) => {
        const week = await loadPatientDoses(this.db, r.patientId, { days: 7 }, now);
        const today = week.doses.filter((d) => d.date === week.today);
        const next = today.find((d) => d.outcome === 'PENDING');
        const name = (d: Dose) => week.meds.find((m) => m.id === d.medicationId)?.name ?? 'Medicine';
        return {
          id: r.patientId,
          name: r.patient.name,
          permissions: r.permissions,
          today: { ...tally(today), next: next ? { time: next.time, medication: name(next) } : null },
          week: tally(week.doses),
        };
      }),
    );
  }

  /** One patient's day in detail (what a caregiver sees when they tap a person). */
  async patientToday(actor: Actor, patientId: string, now = new Date()) {
    this.requireCaregiver(actor);
    await assertPatientAccess(this.db, actor, patientId, 'view_adherence');
    const rel = await this.db.caregiverRelationship.findUniqueOrThrow({
      where: { caregiverId_patientId: { caregiverId: actor.userId, patientId } },
      include: { patient: { select: { name: true } } },
    });
    const week = await loadPatientDoses(this.db, patientId, { days: 7 }, now);
    const meds = await this.db.medication.findMany({
      where: { patientId, deletedAt: null },
      include: { schedules: { where: { archivedAt: null }, orderBy: { time: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    const byId = new Map(meds.map((m) => [m.id, m]));
    return {
      id: patientId,
      name: rel.patient.name,
      permissions: rel.permissions,
      date: week.today,
      today: week.doses
        .filter((d) => d.date === week.today)
        .map((d) => ({
          medicationId: d.medicationId,
          medication: byId.get(d.medicationId)?.name ?? 'Medicine',
          dosage: byId.get(d.medicationId)?.dosage ?? '',
          time: d.time,
          outcome: d.outcome,
          late: d.late,
        })),
      week: tally(week.doses),
      days: [...new Set(week.doses.map((d) => d.date))].map((date) => ({ date, ...tally(week.doses.filter((d) => d.date === date)) })),
      medications: meds.map((m) => ({
        id: m.id,
        name: m.name,
        dosage: m.dosage,
        doseQuantity: Number(m.doseQuantity),
        unit: m.unit,
        foodTiming: m.foodTiming,
        times: m.schedules.map((s) => s.time),
      })),
    };
  }

  /**
   * Missed-dose alerts. Worked out when the caregiver's app asks (so it works on a sleeping free
   * server and without push setup), stored once per dose so the phone never notifies twice.
   */
  async alerts(actor: Actor, now = new Date()) {
    this.requireCaregiver(actor);
    const rels = await this.db.caregiverRelationship.findMany({
      where: { caregiverId: actor.userId, status: 'ACTIVE', permissions: { has: 'receive_alerts' } },
    });
    for (const r of rels) {
      const { doses, meds } = await loadPatientDoses(this.db, r.patientId, { days: 2 }, now);
      const missed = doses.filter(
        (d) => d.outcome === 'MISSED' && d.scheduledFor >= r.createdAt && now.getTime() - d.scheduledFor.getTime() < ALERT_LOOKBACK_MS,
      );
      if (missed.length) {
        await this.db.caregiverAlert.createMany({
          data: missed.map((d) => ({
            caregiverId: actor.userId,
            patientId: r.patientId,
            scheduleId: d.scheduleId,
            scheduledFor: d.scheduledFor,
            medication: meds.find((m) => m.id === d.medicationId)?.name ?? 'Medicine',
          })),
          skipDuplicates: true,
        });
      }
    }
    const rows = await this.db.caregiverAlert.findMany({
      where: { caregiverId: actor.userId, createdAt: { gt: new Date(now.getTime() - 7 * 24 * 3600_000) }, patient: { caregivers: { some: { caregiverId: actor.userId, status: 'ACTIVE' } } } },
      include: { patient: { select: { name: true } } },
      orderBy: { scheduledFor: 'desc' },
      take: 100,
    });
    return rows.map((a) => ({
      id: a.id,
      patientId: a.patientId,
      patientName: a.patient.name,
      medication: a.medication,
      scheduledFor: a.scheduledFor,
      seen: !!a.seenAt,
    }));
  }

  async markSeen(actor: Actor, ids: string[]) {
    this.requireCaregiver(actor);
    await this.db.caregiverAlert.updateMany({ where: { id: { in: ids }, caregiverId: actor.userId, seenAt: null }, data: { seenAt: new Date() } });
  }
}
