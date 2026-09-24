import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { DoseEvent, DoseLog, SkipReason } from '../types/medication';
import { addMinutes } from '../utils/date';
import { uuid } from '../utils/id';

/** One action waiting to be sent to POST /dose-logs/sync. */
export interface OutboxItem {
  clientId: string;
  medicationId: string;
  scheduleId: string;
  scheduledFor: string;
  status: 'TAKEN' | 'SKIPPED' | 'SNOOZED' | 'UNDONE';
  takenAt?: string;
  snoozedUntil?: string;
  skipReason?: SkipReason;
  skipNote?: string;
  loggedAt: string;
}

/** Shape the server returns for a stored dose outcome. */
export interface ServerLog {
  clientId: string;
  medicationId: string;
  scheduleId: string;
  scheduledFor: string;
  status: 'TAKEN' | 'SKIPPED' | 'SNOOZED' | 'MISSED';
  takenAt: string | null;
  snoozedUntil: string | null;
  skipReason: string | null;
  skipNote: string | null;
  loggedAt: string;
}

export type SyncResult =
  | { clientId: string; result: 'applied' | 'duplicate' }
  | { clientId: string; result: 'stale'; current: ServerLog | null }
  | { clientId: string; result: 'rejected'; reason: string };

/**
 * Local dose log + offline outbox. Every action is recorded on the phone first (works with no
 * signal); the outbox is sent to the server by services/sync/doseSync.ts whenever it can.
 */
interface DoseLogState {
  logs: Record<string, DoseLog>;
  outbox: OutboxItem[];
  markTaken: (dose: DoseEvent, at?: Date) => void;
  snooze: (dose: DoseEvent, minutes: number, now?: Date) => void;
  skip: (dose: DoseEvent, reason: SkipReason, note?: string) => void;
  undo: (doseKey: string) => void;
  /** Apply the server's answers for items that were sent. */
  acknowledge: (results: SyncResult[]) => void;
  /** Merge history pulled from the server (another device, or after reinstall). */
  mergeServerLogs: (logs: ServerLog[], window: { from: Date; to: Date }) => void;
}

export const doseKeyOf = (scheduleId: string, scheduledForIso: string) => `${scheduleId}@${new Date(scheduledForIso).toISOString()}`;

function record(s: DoseLogState, dose: DoseEvent, patch: Omit<Partial<DoseLog>, 'status'> & { status: DoseLog['status'] }) {
  const log: DoseLog = {
    clientId: uuid(),
    doseKey: dose.doseKey,
    medicationId: dose.medication.id,
    scheduleId: dose.scheduleId,
    scheduledFor: dose.scheduledFor.toISOString(),
    loggedAt: new Date().toISOString(),
    synced: false,
    ...patch,
  };
  const item: OutboxItem = {
    clientId: log.clientId,
    medicationId: log.medicationId,
    scheduleId: log.scheduleId,
    scheduledFor: log.scheduledFor,
    status: log.status,
    takenAt: log.takenAt,
    snoozedUntil: log.snoozedUntil,
    skipReason: log.skipReason,
    skipNote: log.skipNote,
    loggedAt: log.loggedAt,
  };
  return { logs: { ...s.logs, [dose.doseKey]: log }, outbox: [...s.outbox, item] };
}

function fromServer(l: ServerLog): DoseLog | null {
  if (l.status === 'MISSED') return null; // derived on both sides; nothing to show as an action
  return {
    clientId: l.clientId,
    doseKey: doseKeyOf(l.scheduleId, l.scheduledFor),
    medicationId: l.medicationId,
    scheduleId: l.scheduleId,
    scheduledFor: new Date(l.scheduledFor).toISOString(),
    status: l.status,
    takenAt: l.takenAt ?? undefined,
    snoozedUntil: l.snoozedUntil ?? undefined,
    skipReason: (l.skipReason as SkipReason | null) ?? undefined,
    skipNote: l.skipNote ?? undefined,
    loggedAt: l.loggedAt,
    synced: true,
  };
}

export const useDoseLogs = create<DoseLogState>()(
  persist(
    (set) => ({
      logs: {},
      outbox: [],
      markTaken: (dose, at = new Date()) => set((s) => record(s, dose, { status: 'TAKEN', takenAt: at.toISOString() })),
      snooze: (dose, minutes, now = new Date()) =>
        set((s) => record(s, dose, { status: 'SNOOZED', snoozedUntil: addMinutes(now, minutes).toISOString() })),
      skip: (dose, skipReason, skipNote) => set((s) => record(s, dose, { status: 'SKIPPED', skipReason, skipNote })),
      undo: (doseKey) =>
        set((s) => {
          const existing = s.logs[doseKey];
          if (!existing) return s;
          const { [doseKey]: _removed, ...rest } = s.logs;
          const item: OutboxItem = {
            clientId: uuid(),
            medicationId: existing.medicationId,
            scheduleId: existing.scheduleId,
            scheduledFor: existing.scheduledFor,
            status: 'UNDONE',
            loggedAt: new Date().toISOString(),
          };
          return { logs: rest, outbox: [...s.outbox, item] };
        }),

      acknowledge: (results) =>
        set((s) => {
          const done = new Set(results.map((r) => r.clientId));
          const logs = { ...s.logs };
          for (const r of results) {
            const entry = Object.entries(logs).find(([, l]) => l.clientId === r.clientId);
            if (r.result === 'applied' || r.result === 'duplicate') {
              if (entry) logs[entry[0]] = { ...entry[1], synced: true };
            } else if (r.result === 'stale') {
              // Another device recorded something newer — show that instead.
              if (entry) delete logs[entry[0]];
              const cur = r.current && fromServer(r.current);
              if (cur) logs[cur.doseKey] = cur;
            } else if (entry) {
              // Rejected (e.g. medicine deleted): keep it on the phone but stop retrying.
              logs[entry[0]] = { ...entry[1], synced: true };
            }
          }
          return { logs, outbox: s.outbox.filter((o) => !done.has(o.clientId)) };
        }),

      mergeServerLogs: (serverLogs, window) =>
        set((s) => {
          const pending = new Set(s.outbox.map((o) => doseKeyOf(o.scheduleId, o.scheduledFor)));
          const logs = { ...s.logs };
          const seen = new Set<string>();
          for (const l of serverLogs) {
            const log = fromServer(l);
            if (!log) continue;
            seen.add(log.doseKey);
            if (pending.has(log.doseKey)) continue; // local unsent action is newer
            logs[log.doseKey] = log;
          }
          // Synced local entries the server no longer has were undone elsewhere.
          for (const [key, l] of Object.entries(logs)) {
            const t = Date.parse(l.scheduledFor);
            if (l.synced && !seen.has(key) && !pending.has(key) && t >= window.from.getTime() && t < window.to.getTime()) delete logs[key];
          }
          return { logs };
        }),
    }),
    { name: 'medassist-dose-logs', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
