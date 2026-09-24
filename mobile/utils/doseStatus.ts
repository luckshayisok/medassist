import type { DoseLog, DoseStatus } from '../types/medication';

/** A dose counts as "due now" from its time until this many minutes later. */
export const DUE_WINDOW_MINUTES = 60;

export function deriveStatus(scheduledFor: Date, now: Date, log?: DoseLog): DoseStatus {
  if (log?.status === 'TAKEN') return 'TAKEN';
  if (log?.status === 'SKIPPED') return 'SKIPPED';

  if (log?.status === 'SNOOZED' && log.snoozedUntil) {
    const until = Date.parse(log.snoozedUntil);
    // Snoozed doses become due again when the snooze ends, and stay due for the normal window.
    if (now.getTime() < until) return 'SNOOZED';
    return now.getTime() - until <= DUE_WINDOW_MINUTES * 60_000 ? 'DUE_NOW' : 'MISSED';
  }

  const diffMin = (now.getTime() - scheduledFor.getTime()) / 60_000;
  if (diffMin < 0) return 'UPCOMING';
  if (diffMin <= DUE_WINDOW_MINUTES) return 'DUE_NOW';
  return 'MISSED';
}

/** Minutes late, measured from the scheduled time. 0 if on time or early. */
export function minutesLate(scheduledFor: Date, takenAt: Date): number {
  return Math.max(0, Math.round((takenAt.getTime() - scheduledFor.getTime()) / 60_000));
}
