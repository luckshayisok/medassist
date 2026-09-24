import { z } from 'zod';
import type { MedicationLog } from '../../generated/prisma/client.js';
import { assertPatientAccess } from '../../lib/access.js';
import type { Db } from '../../lib/prisma.js';

type Actor = { userId: string; role: 'PATIENT' | 'CAREGIVER' };

export const SKIP_REASONS = ['FORGOT', 'UNWELL', 'RAN_OUT', 'DOCTOR_ADVISED', 'OTHER'] as const;

const LogItem = z
  .object({
    clientId: z.uuid(),
    medicationId: z.uuid(),
    scheduleId: z.uuid(),
    scheduledFor: z.iso.datetime({ offset: true }),
    /** UNDONE removes the recorded outcome (the patient tapped "Undo"). */
    status: z.enum(['TAKEN', 'SKIPPED', 'SNOOZED', 'UNDONE']),
    takenAt: z.iso.datetime({ offset: true }).nullish(),
    snoozedUntil: z.iso.datetime({ offset: true }).nullish(),
    skipReason: z.enum(SKIP_REASONS).nullish(),
    skipNote: z.string().trim().max(500).nullish(),
    loggedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((l, ctx) => {
    if (l.status === 'TAKEN' && !l.takenAt) ctx.addIssue({ code: 'custom', path: ['takenAt'], message: 'takenAt is required' });
    if (l.status === 'SNOOZED' && !l.snoozedUntil) ctx.addIssue({ code: 'custom', path: ['snoozedUntil'], message: 'snoozedUntil is required' });
  });

export const SyncSchema = z.object({ logs: z.array(LogItem).min(1).max(200) }).strict();
export type LogInput = z.infer<typeof LogItem>;

export type SyncOutcome =
  | { clientId: string; result: 'applied' }
  | { clientId: string; result: 'duplicate' }
  | { clientId: string; result: 'stale'; current: ReturnType<typeof serializeLog> | null }
  | { clientId: string; result: 'rejected'; reason: string };

// Clocks drift; still refuse obviously bogus future timestamps.
const MAX_FUTURE_MS = 36 * 3_600_000;

export function serializeLog(l: MedicationLog) {
  return {
    clientId: l.clientId,
    medicationId: l.medicationId,
    scheduleId: l.scheduleId,
    scheduledFor: l.scheduledFor.toISOString(),
    status: l.status,
    takenAt: l.takenAt?.toISOString() ?? null,
    snoozedUntil: l.snoozedUntil?.toISOString() ?? null,
    skipReason: l.skipReason,
    skipNote: l.skipNote,
    loggedAt: l.clientLoggedAt.toISOString(),
  };
}

export class DoseLogsService {
  constructor(private readonly db: Db) {}

  /**
   * Apply a batch from the phone's offline outbox. Each item is independent:
   * - the same clientId twice → "duplicate" (idempotent retries)
   * - an older action than what's stored for that dose → "stale" (newest wins across devices)
   * - otherwise the dose's single outcome row is created/replaced (or removed for UNDONE)
   */
  async sync(actor: Actor, patientId: string, logs: LogInput[]): Promise<SyncOutcome[]> {
    await assertPatientAccess(this.db, actor, patientId, actor.role === 'PATIENT' ? 'view_adherence' : 'manage_medications');

    // Validate ownership of every medicine/schedule in one query.
    const scheduleIds = [...new Set(logs.map((l) => l.scheduleId))];
    const schedules = await this.db.medicationSchedule.findMany({
      where: { id: { in: scheduleIds } },
      select: { id: true, medicationId: true, medication: { select: { patientId: true } } },
    });
    const byId = new Map(schedules.map((s) => [s.id, s]));
    const out: SyncOutcome[] = [];
    const now = Date.now();

    // Oldest first so a batch containing "taken" then "undo" ends in the right state.
    for (const l of [...logs].sort((a, b) => Date.parse(a.loggedAt) - Date.parse(b.loggedAt))) {
      const s = byId.get(l.scheduleId);
      if (!s || s.medicationId !== l.medicationId || s.medication.patientId !== patientId) {
        out.push({ clientId: l.clientId, result: 'rejected', reason: 'Unknown medicine or schedule' });
        continue;
      }
      const loggedAt = new Date(l.loggedAt);
      const takenAt = l.takenAt ? new Date(l.takenAt) : null;
      if (loggedAt.getTime() > now + MAX_FUTURE_MS || (takenAt && takenAt.getTime() > now + MAX_FUTURE_MS)) {
        out.push({ clientId: l.clientId, result: 'rejected', reason: 'Time is in the future' });
        continue;
      }

      if (await this.db.medicationLog.findUnique({ where: { clientId: l.clientId }, select: { id: true } })) {
        out.push({ clientId: l.clientId, result: 'duplicate' });
        continue;
      }

      const scheduledFor = new Date(l.scheduledFor);
      const existing = await this.db.medicationLog.findUnique({
        where: { scheduleId_scheduledFor: { scheduleId: l.scheduleId, scheduledFor } },
      });
      if (existing && existing.clientLoggedAt.getTime() > loggedAt.getTime()) {
        out.push({ clientId: l.clientId, result: 'stale', current: serializeLog(existing) });
        continue;
      }

      if (l.status === 'UNDONE') {
        if (existing) await this.db.medicationLog.delete({ where: { id: existing.id } });
        out.push({ clientId: l.clientId, result: 'applied' });
        continue;
      }

      const data = {
        clientId: l.clientId,
        status: l.status,
        takenAt: l.status === 'TAKEN' ? takenAt : null,
        snoozedUntil: l.status === 'SNOOZED' && l.snoozedUntil ? new Date(l.snoozedUntil) : null,
        skipReason: l.status === 'SKIPPED' ? (l.skipReason ?? 'OTHER') : null,
        skipNote: l.status === 'SKIPPED' ? (l.skipNote ?? null) : null,
        clientLoggedAt: loggedAt,
        loggedById: actor.userId,
      };
      await this.db.medicationLog.upsert({
        where: { scheduleId_scheduledFor: { scheduleId: l.scheduleId, scheduledFor } },
        create: { ...data, medicationId: l.medicationId, scheduleId: l.scheduleId, patientId, scheduledFor },
        update: data,
      });
      out.push({ clientId: l.clientId, result: 'applied' });
    }
    return out;
  }

  async list(actor: Actor, patientId: string, from: Date, to: Date) {
    await assertPatientAccess(this.db, actor, patientId, 'view_adherence');
    const rows = await this.db.medicationLog.findMany({
      where: { patientId, scheduledFor: { gte: from, lt: to } },
      orderBy: { scheduledFor: 'asc' },
    });
    return rows.map(serializeLog);
  }
}
