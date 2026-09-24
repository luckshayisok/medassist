import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { DoseEvent, DoseLog, SkipReason } from '../types/medication';
import { addMinutes } from '../utils/date';
import { uuid } from '../utils/id';

/**
 * Local dose log. Every action is recorded on-device first so it works offline.
 * `synced: false` entries are the outbox that Phase 12 pushes to POST /sync/logs.
 * Moves to expo-sqlite in Phase 12.
 */
interface DoseLogState {
  logs: Record<string, DoseLog>;
  markTaken: (dose: DoseEvent, at?: Date) => void;
  snooze: (dose: DoseEvent, minutes: number, now?: Date) => void;
  skip: (dose: DoseEvent, reason: SkipReason, note?: string) => void;
  undo: (doseKey: string) => void;
}

function baseLog(dose: DoseEvent) {
  return {
    clientId: uuid(),
    doseKey: dose.doseKey,
    medicationId: dose.medication.id,
    scheduleId: dose.scheduleId,
    scheduledFor: dose.scheduledFor.toISOString(),
    loggedAt: new Date().toISOString(),
    synced: false,
  };
}

export const useDoseLogs = create<DoseLogState>()(
  persist(
    (set) => ({
      logs: {},
      markTaken: (dose, at = new Date()) =>
        set((s) => ({
          logs: {
            ...s.logs,
            [dose.doseKey]: { ...baseLog(dose), status: 'TAKEN', takenAt: at.toISOString() },
          },
        })),
      snooze: (dose, minutes, now = new Date()) =>
        set((s) => ({
          logs: {
            ...s.logs,
            [dose.doseKey]: {
              ...baseLog(dose),
              status: 'SNOOZED',
              snoozedUntil: addMinutes(now, minutes).toISOString(),
            },
          },
        })),
      skip: (dose, skipReason, skipNote) =>
        set((s) => ({
          logs: { ...s.logs, [dose.doseKey]: { ...baseLog(dose), status: 'SKIPPED', skipReason, skipNote } },
        })),
      undo: (doseKey) =>
        set((s) => {
          const { [doseKey]: _removed, ...rest } = s.logs;
          return { logs: rest };
        }),
    }),
    { name: 'medassist-dose-logs', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
