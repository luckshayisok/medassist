import { addDaysKey, dateKeyInTz, dayOfWeekKey, daysBetweenKeys, zonedToUtc } from '../../lib/time.js';

/** A dose counts as missed this long after its time if nothing was recorded (matches the app). */
export const DUE_WINDOW_MS = 60 * 60_000;
/** Taken more than this after the scheduled time counts as "late" (still counts as taken). */
export const LATE_MS = 60 * 60_000;

export interface ScheduleIn {
  id: string;
  time: string;
  frequency: 'DAILY' | 'SPECIFIC_DAYS' | 'EVERY_N_DAYS';
  daysOfWeek: number[];
  intervalDays: number | null;
  startDate: string;
  endDate: string | null;
  archivedAt: Date | null;
}

export interface MedicationIn {
  id: string;
  name: string;
  dosage: string;
  createdAt: Date;
  deletedAt: Date | null;
  schedules: ScheduleIn[];
}

export interface LogIn {
  scheduleId: string;
  scheduledFor: Date;
  status: 'TAKEN' | 'SKIPPED' | 'SNOOZED' | 'MISSED';
  takenAt: Date | null;
  snoozedUntil: Date | null;
  skipReason: string | null;
}

export type DoseOutcome = 'TAKEN' | 'SKIPPED' | 'MISSED' | 'PENDING';

export interface Dose {
  medicationId: string;
  scheduleId: string;
  time: string;
  date: string;
  scheduledFor: Date;
  outcome: DoseOutcome;
  late: boolean;
  skipReason: string | null;
}

function occursOn(s: ScheduleIn, key: string): boolean {
  if (key < s.startDate) return false;
  if (s.endDate && key > s.endDate) return false;
  if (s.frequency === 'DAILY') return true;
  if (s.frequency === 'SPECIFIC_DAYS') return s.daysOfWeek.includes(dayOfWeekKey(key));
  const n = s.intervalDays ?? 1;
  return n >= 1 && daysBetweenKeys(s.startDate, key) % n === 0;
}

/** Every dose that was due between two local dates (inclusive), with its outcome as of `now`. */
export function expandDoses(meds: MedicationIn[], logs: LogIn[], tz: string, fromKey: string, toKey: string, now: Date): Dose[] {
  const logByDose = new Map(logs.map((l) => [`${l.scheduleId}@${l.scheduledFor.toISOString()}`, l]));
  const doses: Dose[] = [];
  for (let key = fromKey; key <= toKey; key = addDaysKey(key, 1)) {
    for (const med of meds) {
      for (const s of med.schedules) {
        if (!occursOn(s, key)) continue;
        const at = zonedToUtc(key, s.time, tz);
        const log = logByDose.get(`${s.id}@${at.toISOString()}`);
        // Only count doses while the plan was really in place: not before the medicine was added
        // to the app, not after a time was removed or the medicine deleted — unless something was logged.
        if (!log) {
          if (at < med.createdAt) continue;
          if (s.archivedAt && at >= s.archivedAt) continue;
          if (med.deletedAt && at >= med.deletedAt) continue;
        }
        doses.push({ medicationId: med.id, scheduleId: s.id, time: s.time, date: key, scheduledFor: at, ...classify(at, log, now) });
      }
    }
  }
  return doses.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
}

function classify(at: Date, log: LogIn | undefined, now: Date): { outcome: DoseOutcome; late: boolean; skipReason: string | null } {
  if (log?.status === 'TAKEN') {
    const late = !!log.takenAt && log.takenAt.getTime() - at.getTime() > LATE_MS;
    return { outcome: 'TAKEN', late, skipReason: null };
  }
  if (log?.status === 'SKIPPED') return { outcome: 'SKIPPED', late: false, skipReason: log.skipReason };
  if (log?.status === 'MISSED') return { outcome: 'MISSED', late: false, skipReason: null };
  // Snoozed: due again when the snooze ends.
  const dueFrom = log?.status === 'SNOOZED' && log.snoozedUntil ? log.snoozedUntil : at;
  return { outcome: now.getTime() - dueFrom.getTime() > DUE_WINDOW_MS ? 'MISSED' : 'PENDING', late: false, skipReason: null };
}

export interface Tally {
  scheduled: number;
  taken: number;
  skipped: number;
  missed: number;
  pending: number;
  late: number;
  /** taken ÷ (taken + skipped + missed), 0–100; null when nothing was due yet. */
  percent: number | null;
}

export function tally(doses: Dose[]): Tally {
  const t = { scheduled: doses.length, taken: 0, skipped: 0, missed: 0, pending: 0, late: 0 };
  for (const d of doses) {
    if (d.outcome === 'TAKEN') t.taken++;
    else if (d.outcome === 'SKIPPED') t.skipped++;
    else if (d.outcome === 'MISSED') t.missed++;
    else t.pending++;
    if (d.late) t.late++;
  }
  const resolved = t.taken + t.skipped + t.missed;
  return { ...t, percent: resolved ? Math.round((t.taken / resolved) * 100) : null };
}

type Period = 'morning' | 'afternoon' | 'evening' | 'night';
function periodOf(hhmm: string): Period {
  const h = Number(hhmm.slice(0, 2));
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

export interface Insight {
  kind: 'praise' | 'pattern' | 'medicine' | 'late' | 'refill' | 'streak' | 'summary';
  text: string;
}

/**
 * Plain-language observations about what was *recorded*. Never diagnoses, never suggests changing
 * treatment or taking extra doses — at most, points to the pharmacist/doctor.
 */
export function buildInsights(doses: Dose[], meds: MedicationIn[], rangeLabel: string, todayKey: string): Insight[] {
  const out: Insight[] = [];
  const t = tally(doses);
  const resolved = t.taken + t.skipped + t.missed;
  if (resolved === 0) return [{ kind: 'summary', text: 'Nothing was due yet in this period.' }];

  // Streak of complete days, counting back from yesterday (today may still be in progress).
  let streak = 0;
  for (let key = addDaysKey(todayKey, -1); ; key = addDaysKey(key, -1)) {
    const day = doses.filter((d) => d.date === key);
    if (!day.length || day.some((d) => d.outcome !== 'TAKEN')) break;
    streak++;
  }

  if (t.percent === 100 && resolved >= 3) out.push({ kind: 'praise', text: `You took every dose ${rangeLabel}. Well done!` });
  else out.push({ kind: 'summary', text: `You took ${t.taken} of ${resolved} ${resolved === 1 ? 'dose' : 'doses'} ${rangeLabel} (${t.percent}%).` });

  if (streak >= 3) out.push({ kind: 'streak', text: `You're on a ${streak}-day streak of taking every dose.` });

  const missedByPeriod = new Map<Period, number>();
  for (const d of doses) if (d.outcome === 'MISSED') missedByPeriod.set(periodOf(d.time), (missedByPeriod.get(periodOf(d.time)) ?? 0) + 1);
  const [worstPeriod, periodCount] = [...missedByPeriod.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (worstPeriod && periodCount && periodCount >= 2) {
    out.push({ kind: 'pattern', text: `You missed your ${worstPeriod} medicine ${periodCount} times ${rangeLabel}.` });
  }

  const missedByMed = new Map<string, number>();
  for (const d of doses) if (d.outcome === 'MISSED') missedByMed.set(d.medicationId, (missedByMed.get(d.medicationId) ?? 0) + 1);
  const [worstMedId, medCount] = [...missedByMed.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  const worstMed = meds.find((m) => m.id === worstMedId);
  // Only worth naming when the patient takes more than one medicine.
  if (worstMed && medCount && medCount >= 2 && meds.filter((m) => !m.deletedAt).length > 1) {
    out.push({ kind: 'medicine', text: `${worstMed.name} was the medicine missed most often (${medCount} times).` });
  }

  if (t.late >= 2) out.push({ kind: 'late', text: `${t.late} doses were taken more than an hour after their time.` });

  const ranOut = doses.filter((d) => d.skipReason === 'RAN_OUT').length;
  if (ranOut > 0) {
    out.push({ kind: 'refill', text: `You skipped ${ranOut === 1 ? 'a dose' : `${ranOut} doses`} because you ran out. Your pharmacy can help with a refill.` });
  }

  return out.slice(0, 4);
}

/** Full report for a date range in the patient's timezone. */
export function adherenceReport(meds: MedicationIn[], logs: LogIn[], tz: string, fromKey: string, toKey: string, now: Date, rangeLabel: string) {
  const doses = expandDoses(meds, logs, tz, fromKey, toKey, now);
  const days: ({ date: string } & Tally)[] = [];
  for (let key = fromKey; key <= toKey; key = addDaysKey(key, 1)) {
    days.push({ date: key, ...tally(doses.filter((d) => d.date === key)) });
  }
  const medications = meds
    .map((m) => ({ id: m.id, name: m.name, dosage: m.dosage, deleted: !!m.deletedAt, ...tally(doses.filter((d) => d.medicationId === m.id)) }))
    .filter((m) => m.scheduled > 0);
  return {
    timezone: tz,
    from: fromKey,
    to: toKey,
    totals: tally(doses),
    days,
    medications,
    insights: buildInsights(doses, meds, rangeLabel, dateKeyInTz(now, tz)),
  };
}
