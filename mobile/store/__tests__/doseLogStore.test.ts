import type { DoseEvent, Medication } from '../../types/medication';
import { dailyBars, describeBar, weeklyBars } from '../../utils/adherenceView';
import { doseKeyOf, useDoseLogs, type ServerLog } from '../doseLogStore';

const med = { id: 'm1', name: 'Metformin' } as Medication;
const dose = (iso: string, scheduleId = 's1'): DoseEvent => ({
  doseKey: doseKeyOf(scheduleId, iso),
  medication: med,
  scheduleId,
  scheduledFor: new Date(iso),
  status: 'DUE_NOW',
});

beforeEach(() => useDoseLogs.setState({ logs: {}, outbox: [] }));

describe('dose outbox', () => {
  it('records every action locally and queues it for the server', () => {
    const d = dose('2026-09-24T02:30:00.000Z');
    const s = useDoseLogs.getState();
    s.markTaken(d, new Date('2026-09-24T02:35:00.000Z'));
    const { logs, outbox } = useDoseLogs.getState();
    expect(logs[d.doseKey]).toMatchObject({ status: 'TAKEN', synced: false });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ status: 'TAKEN', takenAt: '2026-09-24T02:35:00.000Z', scheduleId: 's1', medicationId: 'm1' });
  });

  it('queues an UNDONE tombstone so undo reaches the server too', () => {
    const d = dose('2026-09-24T02:30:00.000Z');
    useDoseLogs.getState().markTaken(d);
    useDoseLogs.getState().undo(d.doseKey);
    const { logs, outbox } = useDoseLogs.getState();
    expect(logs[d.doseKey]).toBeUndefined();
    expect(outbox.map((o) => o.status)).toEqual(['TAKEN', 'UNDONE']);
  });

  it('clears acknowledged items and marks logs synced', () => {
    const d = dose('2026-09-24T02:30:00.000Z');
    useDoseLogs.getState().skip(d, 'UNWELL');
    const { clientId } = useDoseLogs.getState().outbox[0]!;
    useDoseLogs.getState().acknowledge([{ clientId, result: 'applied' }]);
    expect(useDoseLogs.getState().outbox).toEqual([]);
    expect(useDoseLogs.getState().logs[d.doseKey]!.synced).toBe(true);
  });

  it('replaces a stale local action with the newer one from another device', () => {
    const d = dose('2026-09-24T02:30:00.000Z');
    useDoseLogs.getState().skip(d, 'FORGOT');
    const { clientId } = useDoseLogs.getState().outbox[0]!;
    const newer: ServerLog = {
      clientId: 'other', medicationId: 'm1', scheduleId: 's1', scheduledFor: d.scheduledFor.toISOString(), status: 'TAKEN',
      takenAt: '2026-09-24T02:40:00.000Z', snoozedUntil: null, skipReason: null, skipNote: null, loggedAt: '2026-09-24T02:40:00.000Z',
    };
    useDoseLogs.getState().acknowledge([{ clientId, result: 'stale', current: newer }]);
    expect(useDoseLogs.getState().logs[d.doseKey]).toMatchObject({ status: 'TAKEN', clientId: 'other', synced: true });
  });
});

describe('merging server history', () => {
  const window = { from: new Date('2026-09-01T00:00:00Z'), to: new Date('2026-10-01T00:00:00Z') };
  const server = (iso: string, status: ServerLog['status'] = 'TAKEN'): ServerLog => ({
    clientId: `c-${iso}`, medicationId: 'm1', scheduleId: 's1', scheduledFor: iso, status,
    takenAt: status === 'TAKEN' ? iso : null, snoozedUntil: null, skipReason: null, skipNote: null, loggedAt: iso,
  });

  it('adds doses logged on another device', () => {
    useDoseLogs.getState().mergeServerLogs([server('2026-09-20T02:30:00.000Z')], window);
    expect(Object.values(useDoseLogs.getState().logs)).toHaveLength(1);
  });

  it('never overwrites an unsent local action', () => {
    const d = dose('2026-09-20T02:30:00.000Z');
    useDoseLogs.getState().skip(d, 'UNWELL');
    useDoseLogs.getState().mergeServerLogs([server('2026-09-20T02:30:00.000Z', 'TAKEN')], window);
    expect(useDoseLogs.getState().logs[d.doseKey]!.status).toBe('SKIPPED');
  });

  it('drops synced entries that were undone on another device', () => {
    useDoseLogs.getState().mergeServerLogs([server('2026-09-20T02:30:00.000Z')], window);
    useDoseLogs.getState().mergeServerLogs([], window);
    expect(useDoseLogs.getState().logs).toEqual({});
  });
});

describe('chart grouping', () => {
  const days = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10);
    return { date, scheduled: 2, taken: i % 2 ? 2 : 1, skipped: 0, missed: i % 2 ? 0 : 1, pending: 0, late: 0, percent: null };
  });

  it('makes one bar per day for a week', () => {
    const bars = dailyBars(days.slice(-7));
    expect(bars).toHaveLength(7);
    expect(bars.every((b) => b.resolved === 2)).toBe(true);
  });

  it('groups 30 days into weeks counted back from today, with a readable description', () => {
    const bars = weeklyBars(days);
    expect(bars).toHaveLength(5);
    expect(bars.at(-1)!.resolved).toBe(14);
    expect(bars[0]!.resolved).toBe(4); // the 2 oldest leftover days
    expect(describeBar(bars.at(-1)!)).toMatch(/taken, \d+ missed \(\d+%\)\.$/);
  });
});
