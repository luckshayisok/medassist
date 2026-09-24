import type { DoseEvent } from '../types/medication';

export interface AdherenceSummary {
  taken: number;
  /** Doses whose outcome is known (taken, skipped, missed). Upcoming/due/snoozed are excluded. */
  resolved: number;
  totalScheduled: number;
  /** 0–100, or null when nothing is resolved yet. */
  percent: number | null;
}

export function summarize(events: DoseEvent[]): AdherenceSummary {
  let taken = 0;
  let resolved = 0;
  for (const e of events) {
    if (e.status === 'TAKEN') {
      taken++;
      resolved++;
    } else if (e.status === 'SKIPPED' || e.status === 'MISSED') {
      resolved++;
    }
  }
  return {
    taken,
    resolved,
    totalScheduled: events.length,
    percent: resolved === 0 ? null : Math.round((taken / resolved) * 100),
  };
}
