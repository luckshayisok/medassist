import type { DoseEvent, DoseLog, Medication, MedicationSchedule } from '../types/medication';
import { atLocalTime, daysBetween, fromDateKey, toDateKey } from './date';
import { deriveStatus } from './doseStatus';

export function makeDoseKey(scheduleId: string, scheduledFor: Date): string {
  return `${scheduleId}@${scheduledFor.toISOString()}`;
}

/** Does this schedule produce a dose on the given local day? */
export function occursOn(schedule: MedicationSchedule, day: Date): boolean {
  const dayKey = toDateKey(day);
  if (dayKey < schedule.startDate) return false;
  if (schedule.endDate && dayKey > schedule.endDate) return false;

  switch (schedule.frequency) {
    case 'DAILY':
      return true;
    case 'SPECIFIC_DAYS':
      return (schedule.daysOfWeek ?? []).includes(day.getDay());
    case 'EVERY_N_DAYS': {
      const n = schedule.intervalDays ?? 1;
      if (n < 1) return false;
      return daysBetween(fromDateKey(schedule.startDate), day) % n === 0;
    }
  }
}

/** Expand medications into the dose events of one local day, sorted by time. */
export function expandDay(
  medications: Medication[],
  day: Date,
  logs: Record<string, DoseLog>,
  now: Date,
): DoseEvent[] {
  const events: DoseEvent[] = [];
  for (const medication of medications) {
    for (const schedule of medication.schedules) {
      if (!occursOn(schedule, day)) continue;
      const scheduledFor = atLocalTime(day, schedule.time);
      const doseKey = makeDoseKey(schedule.id, scheduledFor);
      const log = logs[doseKey];
      // Same rule as the server: doses from before the medicine was added don't count (unless logged).
      if (!log && medication.createdAt && scheduledFor.getTime() < Date.parse(medication.createdAt)) continue;
      events.push({
        doseKey,
        medication,
        scheduleId: schedule.id,
        scheduledFor,
        log,
        status: deriveStatus(scheduledFor, now, log),
      });
    }
  }
  return events.sort(
    (a, b) =>
      a.scheduledFor.getTime() - b.scheduledFor.getTime() ||
      a.medication.name.localeCompare(b.medication.name),
  );
}

/**
 * The dose the patient should focus on right now.
 * Due-now and expired-snooze doses first, then the next upcoming one.
 * Missed doses are never promoted here: we do not prompt catching up on a missed dose.
 */
export function pickNextDose(events: DoseEvent[], now: Date): DoseEvent | undefined {
  const due = events.find((e) => e.status === 'DUE_NOW');
  if (due) return due;
  const snoozed = events
    .filter((e) => e.status === 'SNOOZED' && e.log?.snoozedUntil)
    .sort((a, b) => Date.parse(a.log!.snoozedUntil!) - Date.parse(b.log!.snoozedUntil!))[0];
  const upcoming = events.find((e) => e.status === 'UPCOMING' && e.scheduledFor > now);
  if (snoozed && (!upcoming || Date.parse(snoozed.log!.snoozedUntil!) <= upcoming.scheduledFor.getTime())) {
    return snoozed;
  }
  return upcoming;
}
