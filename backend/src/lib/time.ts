/**
 * Minimal timezone helpers (no dependencies). Schedules are wall-clock "HH:mm" in the patient's
 * IANA timezone; these convert to real instants so the server agrees with the phone.
 */

/** Offset from UTC in minutes for `tz` at instant `at` (e.g. +330 for Asia/Kolkata). */
export function tzOffsetMinutes(at: Date, tz: string): number {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  const m = part?.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** The instant when the wall clock in `tz` shows `dateKey` `hhmm`. DST-safe. */
export function zonedToUtc(dateKey: string, hhmm: string, tz: string): Date {
  const [y, mo, d] = dateKey.split('-').map(Number) as [number, number, number];
  const [h, mi] = hhmm.split(':').map(Number) as [number, number];
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const first = naive - tzOffsetMinutes(new Date(naive), tz) * 60_000;
  // Re-check the offset at the candidate instant (matters only right at a DST switch).
  const second = naive - tzOffsetMinutes(new Date(first), tz) * 60_000;
  return new Date(second);
}

/** Calendar date (YYYY-MM-DD) of `at` as seen in `tz`. */
export function dateKeyInTz(at: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetweenKeys(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeekKey(key: string): number {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
