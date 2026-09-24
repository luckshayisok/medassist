import type { DoseLog, Medication } from '@/types/medication';
import { addDays, addMinutes, atLocalTime, formatTime } from './date';
import { foodLine, formatDose } from './format';
import { makeDoseKey, occursOn } from './schedule';

/**
 * What the OS should have scheduled right now. Pure: the notification service diffs this against
 * what's actually scheduled (see services/notifications/reconcile.ts).
 */
export type ReminderKind = 'dose' | 'snooze' | 'followup';

export interface PlannedReminder {
  /** Deterministic, so reconciling is idempotent. */
  id: string;
  kind: ReminderKind;
  doseKey: string;
  fireAt: Date;
  title: string;
  body: string;
}

export interface PlanOptions {
  /** How many days ahead to schedule (rolling window, re-planned whenever the app runs). */
  horizonDays?: number;
  /** iOS allows 64 pending notifications per app; keep headroom for test/other notifications. */
  max?: number;
  /** Send a gentle "did you take it?" nudge this many minutes after the dose, if still unlogged. */
  followUpMinutes?: number | null;
  /** Only schedule follow-ups this far ahead (they cost slots in the 64 limit). */
  followUpWindowHours?: number;
}

const DEFAULTS: Required<PlanOptions> = { horizonDays: 4, max: 60, followUpMinutes: 30, followUpWindowHours: 24 };

export function planReminders(
  medications: Medication[],
  logs: Record<string, DoseLog>,
  now: Date,
  options: PlanOptions = {},
): PlannedReminder[] {
  const o = { ...DEFAULTS, ...options };
  const out: PlannedReminder[] = [];
  const followUpUntil = now.getTime() + o.followUpWindowHours * 3_600_000;

  // Start from yesterday so snoozes/follow-ups of a late-evening dose past midnight are kept.
  for (let d = -1; d < o.horizonDays; d++) {
    const day = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), d);
    for (const med of medications) {
      for (const s of med.schedules) {
        if (!occursOn(s, day)) continue;
        const scheduledFor = atLocalTime(day, s.time);
        const doseKey = makeDoseKey(s.id, scheduledFor);
        const log = logs[doseKey];
        if (log?.status === 'TAKEN' || log?.status === 'SKIPPED') continue;

        const what = `${med.name} ${med.dosage}`;
        const how = `Take ${formatDose(med)} · ${foodLine(med)}`;

        if (log?.status === 'SNOOZED' && log.snoozedUntil) {
          const at = new Date(log.snoozedUntil);
          if (at > now) out.push({ id: `snooze:${doseKey}`, kind: 'snooze', doseKey, fireAt: at, title: `💊 Reminder: ${what}`, body: how });
          continue;
        }

        if (scheduledFor > now) {
          out.push({ id: `dose:${doseKey}`, kind: 'dose', doseKey, fireAt: scheduledFor, title: `💊 Time for ${what}`, body: how });
        }
        if (o.followUpMinutes) {
          const at = addMinutes(scheduledFor, o.followUpMinutes);
          if (at > now && at.getTime() <= followUpUntil) {
            out.push({
              id: `followup:${doseKey}`,
              kind: 'followup',
              doseKey,
              fireAt: at,
              title: `Did you take ${med.name}?`,
              // Never suggest doubling up — just ask them to record what happened.
              body: `It was due at ${formatTime(scheduledFor)}. Tap to mark it as taken or skipped.`,
            });
          }
        }
      }
    }
  }

  // Soonest first; the cap drops the furthest-out reminders, which get scheduled on a later run.
  return out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime() || a.id.localeCompare(b.id)).slice(0, o.max);
}

/** Changes in any of these mean the OS notification must be replaced. */
export function reminderSignature(r: PlannedReminder): string {
  return `${r.fireAt.toISOString()}|${r.title}|${r.body}`;
}
