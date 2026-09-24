import type { Tally } from '@/hooks/useAdherence';
import { fromDateKey } from './date';

export interface Bar {
  key: string;
  /** Short label under the bar ("Mon", "Sep 1"). */
  label: string;
  /** Full label for screen readers and the detail line. */
  longLabel: string;
  percent: number | null;
  taken: number;
  skipped: number;
  missed: number;
  resolved: number;
}

function merge(days: ({ date: string } & Tally)[]) {
  const t = days.reduce((a, d) => ({ taken: a.taken + d.taken, skipped: a.skipped + d.skipped, missed: a.missed + d.missed }), { taken: 0, skipped: 0, missed: 0 });
  const resolved = t.taken + t.skipped + t.missed;
  return { ...t, resolved, percent: resolved ? Math.round((t.taken / resolved) * 100) : null };
}

/** One bar per day (week view). */
export function dailyBars(days: ({ date: string } & Tally)[]): Bar[] {
  return days.map((d) => {
    const date = fromDateKey(d.date);
    return {
      key: d.date,
      label: date.toLocaleDateString(undefined, { weekday: 'short' }),
      longLabel: date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }),
      ...merge([d]),
    };
  });
}

/** Group a month of days into weeks, counted back from the most recent day (month view). */
export function weeklyBars(days: ({ date: string } & Tally)[]): Bar[] {
  const out: Bar[] = [];
  for (let end = days.length; end > 0; end -= 7) {
    const chunk = days.slice(Math.max(0, end - 7), end);
    const first = fromDateKey(chunk[0]!.date);
    const last = fromDateKey(chunk[chunk.length - 1]!.date);
    const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    out.unshift({ key: chunk[0]!.date, label: fmt(first), longLabel: `${fmt(first)} to ${fmt(last)}`, ...merge(chunk) });
  }
  return out;
}

export function describeBar(b: Bar): string {
  if (b.resolved === 0) return `${b.longLabel}: nothing was due yet.`;
  const parts = [`${b.taken} of ${b.resolved} taken`];
  if (b.missed) parts.push(`${b.missed} missed`);
  if (b.skipped) parts.push(`${b.skipped} skipped`);
  return `${b.longLabel}: ${parts.join(', ')} (${b.percent}%).`;
}
